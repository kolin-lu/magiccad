import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { generate, AVAILABLE_MODELS, DEFAULT_MODEL } from "./llm.js";
import { createHistoryStore } from "./history.js";
import {
  generateOpenAI,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
} from "./llm-openai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const history = createHistoryStore(path.join(__dirname, "..", "data"));

// ---------- 会话历史 ----------

app.get("/api/sessions", async (_req, res) => {
  res.json(await history.list());
});

app.get("/api/sessions/:id", async (req, res) => {
  const session = await history.get(req.params.id);
  if (!session) return res.status(404).json({ error: "会话不存在" });
  res.json(session);
});

app.put("/api/sessions/:id", async (req, res) => {
  try {
    const record = await history.save(req.params.id, req.body || {});
    res.json({ id: record.id, updatedAt: record.updatedAt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/sessions/:id", async (req, res) => {
  res.json({ ok: await history.remove(req.params.id) });
});

app.get("/api/config", (_req, res) => {
  res.json({
    anthropic: {
      models: AVAILABLE_MODELS,
      defaultModel: DEFAULT_MODEL,
      hasEnvKey: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    openai: {
      defaultBaseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
      defaultModel: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      hasEnvKey: Boolean(process.env.OPENAI_API_KEY),
    },
  });
});

// 流式生成：返回 NDJSON（每行一个 JSON 事件）
app.post("/api/generate", async (req, res) => {
  const { messages, provider = "anthropic", apiKey, model, baseUrl } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages 不能为空" });
  }

  const envKey =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !envKey) {
    const keyName = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    return res.status(401).json({
      error: `未配置 API Key。请在左下角设置中填入 Key，或启动前设置环境变量 ${keyName}。`,
    });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event) => res.write(JSON.stringify(event) + "\n");

  try {
    if (provider === "openai") {
      await generateOpenAI({ messages, apiKey, model, baseUrl }, send);
    } else {
      await generate({ messages, apiKey, model }, send);
    }
  } catch (err) {
    send({ type: "error", message: describeError(err, provider) });
  } finally {
    res.end();
  }
});

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

app.listen(PORT, () => {
  console.log(`\n  MagicCAD 已启动: http://localhost:${PORT}\n`);
});
