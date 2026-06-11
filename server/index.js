import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { generate, AVAILABLE_MODELS, DEFAULT_MODEL } from "./llm.js";
import {
  generateOpenAI,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
} from "./llm-openai.js";
import { createDB } from "./db.js";
import { createAuth, publicUser } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;

const db = createDB(path.join(__dirname, "..", "data"));
const auth = createAuth(db);

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(auth.attachUser);

// ---------- 注册 / 登录 ----------

const USERNAME_RE = /^[\w-]{3,20}$/;

app.post("/api/auth/register", (req, res) => {
  const { username = "", password = "" } = req.body || {};
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "用户名需为 3-20 位字母、数字、下划线或连字符" });
  }
  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "密码至少 6 位" });
  }
  if (db.users.byUsername(username)) {
    return res.status(409).json({ error: "用户名已被注册" });
  }
  const user = db.users.create(username, password);
  auth.setTokenCookie(res, db.authSessions.create(user.id));
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { username = "", password = "" } = req.body || {};
  const user = db.users.verify(String(username), String(password));
  if (!user) return res.status(401).json({ error: "用户名或密码错误" });
  auth.setTokenCookie(res, db.authSessions.create(user.id));
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  db.authSessions.remove(req.authToken);
  auth.clearTokenCookie(res);
  res.json({ ok: true });
});

app.post("/api/auth/password", auth.requireAuth, (req, res) => {
  const { oldPassword = "", newPassword = "" } = req.body || {};
  if (!db.users.verify(req.user.username, String(oldPassword))) {
    return res.status(401).json({ error: "原密码错误" });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "新密码至少 6 位" });
  }
  db.users.setPassword(req.user.id, newPassword);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "未登录" });
  res.json({ user: publicUser(req.user) });
});

// ---------- 会话历史（按用户隔离） ----------

app.get("/api/sessions", auth.requireAuth, (req, res) => {
  res.json(db.chats.list(req.user.id));
});

app.get("/api/sessions/:id", auth.requireAuth, (req, res) => {
  const session = db.chats.get(req.user.id, req.params.id);
  if (!session) return res.status(404).json({ error: "会话不存在" });
  res.json(session);
});

app.put("/api/sessions/:id", auth.requireAuth, (req, res) => {
  try {
    const record = db.chats.save(req.user.id, req.params.id, req.body || {});
    res.json({ id: record.id, updatedAt: record.updatedAt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/sessions/:id", auth.requireAuth, (req, res) => {
  res.json({ ok: db.chats.remove(req.user.id, req.params.id) });
});

// ---------- 大模型配置 ----------

const PROVIDERS = new Set(["anthropic", "openai"]);

// 当前用户可见的配置状态（Key 永不回传，只回传是否已配置）
app.get("/api/llm/config", auth.requireAuth, (req, res) => {
  const a = db.llm.userConfig(req.user.id, "anthropic");
  const o = db.llm.userConfig(req.user.id, "openai");
  const sharedA = db.llm.sharedConfig("anthropic");
  const sharedO = db.llm.sharedConfig("openai");
  res.json({
    anthropic: {
      models: AVAILABLE_MODELS,
      defaultModel: DEFAULT_MODEL,
      model: a?.model || "",
      hasKey: Boolean(a?.api_key) || Boolean(process.env.ANTHROPIC_API_KEY),
    },
    openai: {
      defaultBaseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
      defaultModel: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      baseUrl: o?.base_url || "",
      model: o?.model || "",
      hasKey: Boolean(o?.api_key) || Boolean(process.env.OPENAI_API_KEY),
    },
    shared: {
      allowed: Boolean(req.user.shared_allowed) || req.user.role === "admin",
      anthropic: Boolean(sharedA?.enabled && sharedA?.api_key),
      openai: Boolean(sharedO?.enabled && sharedO?.api_key),
    },
  });
});

app.put("/api/llm/config", auth.requireAuth, (req, res) => {
  const { provider, apiKey, model, baseUrl } = req.body || {};
  if (!PROVIDERS.has(provider)) return res.status(400).json({ error: "无效的服务商" });
  db.llm.saveUserConfig(req.user.id, provider, { apiKey, model, baseUrl });
  res.json({ ok: true });
});

// ---------- 生成（流式 NDJSON） ----------

app.post("/api/generate", auth.requireAuth, async (req, res) => {
  const { messages, provider = "anthropic", model, baseUrl, keySource = "own" } =
    req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages 不能为空" });
  }
  if (!PROVIDERS.has(provider)) {
    return res.status(400).json({ error: "无效的服务商" });
  }

  let apiKey;
  let finalModel = typeof model === "string" ? model.trim() : "";
  let finalBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";

  if (keySource === "shared") {
    // 平台共享配置：由管理员配置并逐个授权使用，Key 不离开服务端
    if (!req.user.shared_allowed && req.user.role !== "admin") {
      return res.status(403).json({ error: "你还未获得平台共享模型的使用授权，请联系管理员。" });
    }
    const shared = db.llm.sharedConfig(provider);
    if (!shared?.enabled || !shared?.api_key) {
      return res.status(400).json({ error: "管理员尚未启用该服务商的共享配置。" });
    }
    apiKey = shared.api_key;
    finalModel = shared.model || finalModel;
    finalBaseUrl = shared.base_url || finalBaseUrl;
  } else {
    // 用户自己的配置：账户内保存的 Key，回落到服务器环境变量
    const cfg = db.llm.userConfig(req.user.id, provider);
    apiKey =
      cfg?.api_key ||
      (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);
    if (!apiKey) {
      return res.status(401).json({
        error: "未配置 API Key。请在左下角设置中填入你的 Key，或切换到平台共享模型。",
      });
    }
    finalModel = finalModel || cfg?.model || "";
    finalBaseUrl = finalBaseUrl || cfg?.base_url || "";
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event) => res.write(JSON.stringify(event) + "\n");

  try {
    if (provider === "openai") {
      await generateOpenAI(
        { messages, apiKey, model: finalModel || undefined, baseUrl: finalBaseUrl || undefined },
        send
      );
    } else {
      await generate({ messages, apiKey, model: finalModel || undefined }, send);
    }
  } catch (err) {
    send({ type: "error", message: describeError(err, provider) });
  } finally {
    res.end();
  }
});

// ---------- 作品市场 ----------

app.get("/api/works", auth.requireAuth, (req, res) => {
  res.json(db.works.list(req.user.id));
});

app.get("/api/works/:id", auth.requireAuth, (req, res) => {
  const work = db.works.get(req.user.id, Number(req.params.id));
  if (!work) return res.status(404).json({ error: "作品不存在" });
  res.json(work);
});

// 封面为画布截图的 data URL，限制格式与体积
const COVER_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
const COVER_MAX_LENGTH = 500_000;

app.post("/api/works", auth.requireAuth, (req, res) => {
  const { title, description, code, cover } = req.body || {};
  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "请填写作品标题" });
  }
  if (!code || typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "没有可分享的建模代码" });
  }
  const validCover =
    typeof cover === "string" && cover.length <= COVER_MAX_LENGTH && COVER_RE.test(cover)
      ? cover
      : "";
  const id = db.works.create(req.user.id, {
    title: title.trim(),
    description: typeof description === "string" ? description.trim() : "",
    code,
    cover: validCover,
  });
  res.json({ id });
});

app.delete("/api/works/:id", auth.requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const owner = db.works.ownerOf(id);
  if (owner == null) return res.status(404).json({ error: "作品不存在" });
  if (owner !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ error: "只能删除自己的作品" });
  }
  res.json({ ok: db.works.remove(id) });
});

app.post("/api/works/:id/like", auth.requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (db.works.ownerOf(id) == null) return res.status(404).json({ error: "作品不存在" });
  res.json(db.works.toggleLike(req.user.id, id));
});

// ---------- 管理员 ----------

app.get("/api/admin/users", auth.requireAdmin, (_req, res) => {
  res.json(
    db.users.list().map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      sharedAllowed: Boolean(u.shared_allowed),
      workCount: u.work_count,
      createdAt: u.created_at,
    }))
  );
});

app.put("/api/admin/users/:id", auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = db.users.byId(id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (typeof req.body?.sharedAllowed === "boolean") {
    db.users.setSharedAllowed(id, req.body.sharedAllowed);
  }
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = db.users.byId(id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (target.id === req.user.id) return res.status(400).json({ error: "不能删除自己" });
  if (target.role === "admin") return res.status(400).json({ error: "不能删除管理员账户" });
  res.json({ ok: db.users.remove(id) });
});

app.get("/api/admin/shared-config", auth.requireAdmin, (_req, res) => {
  const view = (provider) => {
    const c = db.llm.sharedConfig(provider);
    return {
      enabled: Boolean(c?.enabled),
      hasKey: Boolean(c?.api_key),
      model: c?.model || "",
      baseUrl: c?.base_url || "",
    };
  };
  res.json({ anthropic: view("anthropic"), openai: view("openai") });
});

app.put("/api/admin/shared-config", auth.requireAdmin, (req, res) => {
  const { provider, enabled, apiKey, model, baseUrl } = req.body || {};
  if (!PROVIDERS.has(provider)) return res.status(400).json({ error: "无效的服务商" });
  db.llm.saveSharedConfig(provider, { enabled: Boolean(enabled), apiKey, model, baseUrl });
  res.json({ ok: true });
});

// ---------- 错误描述 ----------

function describeError(err, provider) {
  // Anthropic SDK 类型化异常
  if (err instanceof Anthropic.AuthenticationError) return "API Key 无效，请检查设置。";
  if (err instanceof Anthropic.RateLimitError) return "请求过于频繁（已触发限流），请稍后重试。";
  if (err instanceof Anthropic.NotFoundError) return "所选模型不可用，请换一个模型。";
  if (err instanceof Anthropic.APIConnectionError) return "无法连接到 Anthropic API，请检查网络。";
  if (err instanceof Anthropic.APIError) return `API 错误（${err.status}）：${err.message}`;

  // OpenAI SDK 类型化异常
  if (err instanceof OpenAI.AuthenticationError) return "API Key 无效，请检查设置。";
  if (err instanceof OpenAI.RateLimitError) return "请求过于频繁（已触发限流），请稍后重试。";
  if (err instanceof OpenAI.NotFoundError)
    return "模型或接口路径不存在，请检查模型名称和 Base URL（一般以 /v1 结尾）。";
  if (err instanceof OpenAI.APIConnectionError)
    return provider === "openai"
      ? "无法连接到服务，请检查 Base URL 和网络。"
      : "网络连接失败，请重试。";
  if (err instanceof OpenAI.APIError) return `API 错误（${err.status}）：${err.message}`;

  return err?.message || "生成失败，请重试。";
}

const seeded = db.seedAdmin();

app.listen(PORT, () => {
  console.log(`\n  MagicCAD 已启动: http://localhost:${PORT}`);
  if (seeded) {
    console.log(
      `  已创建管理员账户：${seeded.username} / ${seeded.password}（请登录后尽快修改，或用 MAGICCAD_ADMIN_PASSWORD 环境变量指定）`
    );
  }
  console.log("");
});
