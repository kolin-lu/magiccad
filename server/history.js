import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 会话历史持久化：每个会话一个 JSON 文件，存放在项目 data/sessions/ 目录。
 * { id, title, messages, code, updatedAt }
 */
export function createHistoryStore(dataDir) {
  const dir = path.join(dataDir, "sessions");

  const isValidId = (id) => /^[a-zA-Z0-9-]{8,64}$/.test(id);
  const fileOf = (id) => path.join(dir, `${id}.json`);

  async function ensureDir() {
    await fs.mkdir(dir, { recursive: true });
  }

  return {
    async list() {
      await ensureDir();
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
      const sessions = [];
      for (const f of files) {
        try {
          const data = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
          sessions.push({
            id: data.id,
            title: data.title || "未命名会话",
            updatedAt: data.updatedAt,
            messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
            hasCode: Boolean(data.code),
          });
        } catch {
          // 跳过损坏的文件
        }
      }
      sessions.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      return sessions;
    },

    async get(id) {
      if (!isValidId(id)) return null;
      try {
        return JSON.parse(await fs.readFile(fileOf(id), "utf8"));
      } catch {
        return null;
      }
    },

    async save(id, { title, messages, code }) {
      if (!isValidId(id)) throw new Error("无效的会话 ID");
      if (!Array.isArray(messages)) throw new Error("messages 必须是数组");
      await ensureDir();
      const record = {
        id,
        title: String(title || "未命名会话").slice(0, 80),
        messages,
        code: typeof code === "string" ? code : "",
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(fileOf(id), JSON.stringify(record, null, 2), "utf8");
      return record;
    },

    async remove(id) {
      if (!isValidId(id)) return false;
      try {
        await fs.unlink(fileOf(id));
        return true;
      } catch {
        return false;
      }
    },
  };
}
