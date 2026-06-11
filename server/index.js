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
import { createJobManager } from "./jobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;

const db = createDB(path.join(__dirname, "..", "data"));
const auth = createAuth(db);
const jobsMgr = createJobManager();

const app = express();
app.use(express.json({ limit: "10mb" })); // 需容纳带图片（base64）的对话
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

// 消息内容块校验：string 或 [{type:'text',text} | {type:'image',mediaType,data(base64)}]
const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_CHARS = 3_000_000; // base64 字符数，约 2.2MB 图片
const MAX_BLOCKS_PER_MESSAGE = 8;
const KEEP_RECENT_IMAGES = 2;

function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content) || m.content.length === 0 || m.content.length > MAX_BLOCKS_PER_MESSAGE) {
      return null;
    }
    const blocks = [];
    for (const b of m.content) {
      if (b?.type === "text" && typeof b.text === "string") {
        blocks.push({ type: "text", text: b.text });
      } else if (
        b?.type === "image" &&
        IMAGE_MEDIA_TYPES.has(b.mediaType) &&
        typeof b.data === "string" &&
        b.data.length > 0 &&
        b.data.length <= MAX_IMAGE_CHARS &&
        /^[A-Za-z0-9+/=]+$/.test(b.data)
      ) {
        blocks.push({ type: "image", mediaType: b.mediaType, data: b.data });
      } else {
        return null;
      }
    }
    out.push({ role: m.role, content: blocks });
  }
  return out;
}

/** 发给模型的副本：只保留最近几张图，更早的替换为占位文本（控制 token 成本）。不修改入参 */
function limitImages(messages) {
  let kept = 0;
  const out = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (typeof m.content === "string") {
      out.unshift(m);
      continue;
    }
    const blocks = m.content.map((b) => {
      if (b.type !== "image") return b;
      kept += 1;
      return kept <= KEEP_RECENT_IMAGES
        ? b
        : { type: "text", text: "〔此处原为一张参考图片，为节省上下文已省略〕" };
    });
    out.unshift({ role: m.role, content: blocks });
  }
  return out;
}

/** 去掉模型混在正文里的 <think> 内容，得到应入库的回答正文 */
function stripThink(text) {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}

function hasImages(messages) {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "image")
  );
}

// 创建后台生成任务：任务独立于连接运行，结果自动落库到会话，
// 客户端通过 /api/jobs/:id/stream 旁听（断开可重连回放）
app.post("/api/generate", auth.requireAuth, (req, res) => {
  const { provider = "anthropic", model, baseUrl, keySource = "own", sessionId, title } =
    req.body || {};
  const messages = sanitizeMessages(req.body?.messages);
  if (!messages) {
    return res.status(400).json({ error: "messages 为空或格式无效" });
  }
  if (typeof sessionId !== "string" || !sessionId) {
    return res.status(400).json({ error: "缺少会话 ID" });
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
      return res.status(403).json({ error: "你的共享模型使用权已被管理员关闭，请使用自己的 API Key 或联系管理员。" });
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

  // 每用户同时只允许一个生成任务
  const running = jobsMgr.activeFor(req.user.id);
  if (running) {
    return res
      .status(409)
      .json({ error: "已有正在进行的生成任务", jobId: running.id, sessionId: running.sessionId });
  }

  // 先把含本轮用户消息的完整会话落库——即使页面随后关闭，会话也是完整的
  try {
    db.chats.save(req.user.id, sessionId, {
      title: title || "未命名会话",
      messages,
      code: db.chats.get(req.user.id, sessionId)?.code || "",
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const job = jobsMgr.create(req.user.id, sessionId);
  const showThinking = db.settings.get("show_thinking") === "1";
  const withImages = hasImages(messages);
  const llmMessages = limitImages(messages);

  (async () => {
    const send = (event) => jobsMgr.push(job, event);
    try {
      if (provider === "openai") {
        await generateOpenAI(
          {
            messages: llmMessages,
            apiKey,
            model: finalModel || undefined,
            baseUrl: finalBaseUrl || undefined,
            showThinking,
          },
          send
        );
      } else {
        await generate(
          { messages: llmMessages, apiKey, model: finalModel || undefined, showThinking },
          send
        );
      }
    } catch (err) {
      send({ type: "error", message: describeError(err, provider, withImages) });
    } finally {
      // 无论客户端是否在线，把回答正文落库（思考内容不入库）
      const fullText = job.events
        .filter((e) => e.type === "text")
        .map((e) => e.text)
        .join("");
      const visible = stripThink(fullText);
      if (visible) {
        try {
          db.chats.appendAssistant(job.userId, job.sessionId, visible);
        } catch {
          // 落库失败不影响任务结束
        }
      }
      jobsMgr.finish(job);
    }
  })();

  res.json({ jobId: job.id, sessionId });
});

// 当前用户正在运行的任务（页面加载时用于续接）
app.get("/api/jobs/active", auth.requireAuth, (req, res) => {
  const job = jobsMgr.activeFor(req.user.id);
  res.json(job ? { jobId: job.id, sessionId: job.sessionId } : { jobId: null });
});

// 旁听任务事件流：先回放全量缓存，再续实时；断开重连不丢内容
app.get("/api/jobs/:id/stream", auth.requireAuth, (req, res) => {
  const job = jobsMgr.get(req.params.id);
  if (!job || job.userId !== req.user.id) {
    return res.status(404).json({ error: "任务不存在或已过期" });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  let idx = 0;
  const flush = () => {
    while (idx < job.events.length) {
      res.write(JSON.stringify(job.events[idx++]) + "\n");
    }
  };

  flush();
  if (job.status !== "running") return res.end();

  const onUpdate = () => {
    flush();
    if (job.status !== "running") {
      job.listeners.delete(onUpdate);
      res.end();
    }
  };
  job.listeners.add(onUpdate);
  req.on("close", () => job.listeners.delete(onUpdate));
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

app.get("/api/admin/settings", auth.requireAdmin, (_req, res) => {
  res.json({ showThinking: db.settings.get("show_thinking") === "1" });
});

app.put("/api/admin/settings", auth.requireAdmin, (req, res) => {
  if (typeof req.body?.showThinking === "boolean") {
    db.settings.set("show_thinking", req.body.showThinking ? "1" : "0");
  }
  res.json({ ok: true });
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

function describeError(err, provider, withImages = false) {
  // 带图请求被 OpenAI 协议服务拒绝，多半是模型不支持视觉输入
  if (withImages && provider === "openai" && err instanceof OpenAI.BadRequestError) {
    return "请求被拒绝：当前模型可能不支持图片输入，请在设置中换用支持视觉的模型（如 gpt-4o、qwen-vl-max）。";
  }

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
