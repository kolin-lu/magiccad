import { DatabaseSync } from "node:sqlite";
import { promises as fsp, mkdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * SQLite 数据层（使用 Node 内置 node:sqlite，无需原生依赖）。
 * 表：users / auth_sessions / chat_sessions / user_llm_configs / shared_llm_configs / works / work_likes
 */
export function createDB(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "magiccad.db"));

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash  TEXT NOT NULL,
      role           TEXT NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
      shared_allowed INTEGER NOT NULL DEFAULT 1,     -- 是否可用平台共享模型（新用户默认开启，管理员可取消）
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL DEFAULT '未命名会话',
      messages   TEXT NOT NULL DEFAULT '[]',
      code       TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_llm_configs (
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,                        -- 'anthropic' | 'openai'
      api_key  TEXT NOT NULL DEFAULT '',
      model    TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS shared_llm_configs (
      provider TEXT PRIMARY KEY,                     -- 'anthropic' | 'openai'
      enabled  INTEGER NOT NULL DEFAULT 0,
      api_key  TEXT NOT NULL DEFAULT '',
      model    TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS works (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      code        TEXT NOT NULL,
      cover       TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS work_likes (
      work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (work_id, user_id)
    );
  `);

  // 旧库迁移：works 表补充封面列
  const workCols = db.prepare("PRAGMA table_info(works)").all();
  if (!workCols.some((c) => c.name === "cover")) {
    db.exec("ALTER TABLE works ADD COLUMN cover TEXT NOT NULL DEFAULT ''");
  }

  const now = () => new Date().toISOString();

  // ---------- 密码哈希（scrypt + 随机盐） ----------

  function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(":");
    if (!salt || !hash) return false;
    const calc = crypto.scryptSync(password, salt, 64);
    const expect = Buffer.from(hash, "hex");
    return calc.length === expect.length && crypto.timingSafeEqual(calc, expect);
  }

  // ---------- 用户 ----------

  const users = {
    create(username, password, role = "user") {
      // 新用户默认开启共享模型授权，管理员可在后台逐个取消
      const r = db
        .prepare(
          "INSERT INTO users (username, password_hash, role, shared_allowed, created_at) VALUES (?, ?, ?, 1, ?)"
        )
        .run(username, hashPassword(password), role, now());
      return users.byId(r.lastInsertRowid);
    },
    byId(id) {
      return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
    },
    byUsername(username) {
      return db.prepare("SELECT * FROM users WHERE username = ?").get(username) || null;
    },
    verify(username, password) {
      const u = users.byUsername(username);
      return u && verifyPassword(password, u.password_hash) ? u : null;
    },
    list() {
      return db
        .prepare(
          `SELECT u.id, u.username, u.role, u.shared_allowed, u.created_at,
                  (SELECT COUNT(*) FROM works w WHERE w.user_id = u.id) AS work_count
             FROM users u ORDER BY u.id`
        )
        .all();
    },
    setPassword(id, password) {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        hashPassword(password),
        id
      );
    },
    setSharedAllowed(id, allowed) {
      db.prepare("UPDATE users SET shared_allowed = ? WHERE id = ?").run(allowed ? 1 : 0, id);
    },
    remove(id) {
      return db.prepare("DELETE FROM users WHERE id = ?").run(id).changes > 0;
    },
  };

  // ---------- 登录会话 ----------

  const SESSION_DAYS = 30;

  const authSessions = {
    create(userId) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
      db.prepare("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
        token,
        userId,
        expires
      );
      return token;
    },
    userOf(token) {
      if (!token) return null;
      const row = db
        .prepare(
          `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?`
        )
        .get(token, now());
      return row || null;
    },
    remove(token) {
      if (token) db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
    },
    prune() {
      db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now());
    },
  };

  // ---------- 会话历史（每用户隔离） ----------

  const isValidChatId = (id) => /^[a-zA-Z0-9-]{8,64}$/.test(id);

  const chats = {
    list(userId) {
      return db
        .prepare(
          "SELECT id, title, messages, code, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC"
        )
        .all(userId)
        .map((r) => ({
          id: r.id,
          title: r.title,
          updatedAt: r.updated_at,
          messageCount: safeParse(r.messages, []).length,
          hasCode: Boolean(r.code),
        }));
    },
    get(userId, id) {
      if (!isValidChatId(id)) return null;
      const r = db
        .prepare("SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?")
        .get(id, userId);
      if (!r) return null;
      return {
        id: r.id,
        title: r.title,
        messages: safeParse(r.messages, []),
        code: r.code,
        updatedAt: r.updated_at,
      };
    },
    save(userId, id, { title, messages, code }) {
      if (!isValidChatId(id)) throw new Error("无效的会话 ID");
      if (!Array.isArray(messages)) throw new Error("messages 必须是数组");
      const record = {
        id,
        title: String(title || "未命名会话").slice(0, 80),
        messages: JSON.stringify(messages),
        code: typeof code === "string" ? code : "",
        updatedAt: now(),
      };
      db.prepare(
        `INSERT INTO chat_sessions (id, user_id, title, messages, code, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, messages = excluded.messages,
           code = excluded.code, updated_at = excluded.updated_at
         WHERE chat_sessions.user_id = excluded.user_id`
      ).run(record.id, userId, record.title, record.messages, record.code, record.updatedAt);
      return record;
    },
    remove(userId, id) {
      if (!isValidChatId(id)) return false;
      return (
        db.prepare("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?").run(id, userId)
          .changes > 0
      );
    },
  };

  // ---------- 大模型配置 ----------

  const llm = {
    userConfig(userId, provider) {
      return (
        db
          .prepare("SELECT * FROM user_llm_configs WHERE user_id = ? AND provider = ?")
          .get(userId, provider) || null
      );
    },
    saveUserConfig(userId, provider, { apiKey, model, baseUrl }) {
      const current = llm.userConfig(userId, provider);
      db.prepare(
        `INSERT INTO user_llm_configs (user_id, provider, api_key, model, base_url)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, provider) DO UPDATE SET
           api_key = excluded.api_key, model = excluded.model, base_url = excluded.base_url`
      ).run(
        userId,
        provider,
        // apiKey 为 null/undefined 表示保留原 Key，空字符串表示清除
        apiKey == null ? current?.api_key || "" : String(apiKey),
        String(model ?? current?.model ?? ""),
        String(baseUrl ?? current?.base_url ?? "")
      );
    },
    sharedConfig(provider) {
      return db.prepare("SELECT * FROM shared_llm_configs WHERE provider = ?").get(provider) || null;
    },
    saveSharedConfig(provider, { enabled, apiKey, model, baseUrl }) {
      const current = llm.sharedConfig(provider);
      db.prepare(
        `INSERT INTO shared_llm_configs (provider, enabled, api_key, model, base_url)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           enabled = excluded.enabled, api_key = excluded.api_key,
           model = excluded.model, base_url = excluded.base_url`
      ).run(
        provider,
        enabled ? 1 : 0,
        apiKey == null ? current?.api_key || "" : String(apiKey),
        String(model ?? current?.model ?? ""),
        String(baseUrl ?? current?.base_url ?? "")
      );
    },
  };

  // ---------- 作品市场 ----------

  const works = {
    list(viewerId) {
      return db
        .prepare(
          `SELECT w.id, w.title, w.description, w.cover, w.created_at, w.user_id,
                  u.username AS author,
                  (SELECT COUNT(*) FROM work_likes l WHERE l.work_id = w.id) AS likes,
                  EXISTS(SELECT 1 FROM work_likes l WHERE l.work_id = w.id AND l.user_id = ?) AS liked
             FROM works w JOIN users u ON u.id = w.user_id
            ORDER BY w.created_at DESC`
        )
        .all(viewerId)
        .map((r) => publicWork(r, viewerId));
    },
    get(viewerId, id) {
      const r = db
        .prepare(
          `SELECT w.*, u.username AS author,
                  (SELECT COUNT(*) FROM work_likes l WHERE l.work_id = w.id) AS likes,
                  EXISTS(SELECT 1 FROM work_likes l WHERE l.work_id = w.id AND l.user_id = ?) AS liked
             FROM works w JOIN users u ON u.id = w.user_id WHERE w.id = ?`
        )
        .get(viewerId, id);
      return r ? { ...publicWork(r, viewerId), code: r.code } : null;
    },
    create(userId, { title, description, code, cover }) {
      const r = db
        .prepare(
          "INSERT INTO works (user_id, title, description, code, cover, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          userId,
          String(title).slice(0, 80),
          String(description || "").slice(0, 500),
          String(code),
          String(cover || ""),
          now()
        );
      return Number(r.lastInsertRowid);
    },
    ownerOf(id) {
      return db.prepare("SELECT user_id FROM works WHERE id = ?").get(id)?.user_id ?? null;
    },
    remove(id) {
      return db.prepare("DELETE FROM works WHERE id = ?").run(id).changes > 0;
    },
    toggleLike(userId, workId) {
      const removed = db
        .prepare("DELETE FROM work_likes WHERE work_id = ? AND user_id = ?")
        .run(workId, userId).changes;
      if (!removed) {
        db.prepare("INSERT INTO work_likes (work_id, user_id) VALUES (?, ?)").run(workId, userId);
      }
      const likes = db
        .prepare("SELECT COUNT(*) AS c FROM work_likes WHERE work_id = ?")
        .get(workId).c;
      return { liked: !removed, likes };
    },
  };

  function publicWork(r, viewerId) {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      cover: r.cover || "",
      author: r.author,
      createdAt: r.created_at,
      likes: r.likes,
      liked: Boolean(r.liked),
      mine: r.user_id === viewerId,
    };
  }

  // ---------- 管理员初始化 ----------

  function seedAdmin() {
    const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (existing) return null;
    const password = process.env.MAGICCAD_ADMIN_PASSWORD || "admin123456";
    users.create("admin", password, "admin");
    return { username: "admin", password };
  }

  authSessions.prune();

  return { users, authSessions, chats, llm, works, seedAdmin };
}

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
