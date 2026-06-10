import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { generate, AVAILABLE_MODELS, DEFAULT_MODEL } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/config", (_req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    defaultModel: DEFAULT_MODEL,
    hasEnvKey: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

// 流式生成：返回 NDJSON（每行一个 JSON 事件）
app.post("/api/generate", async (req, res) => {
  const { messages, apiKey, model } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages 不能为空" });
  }
  if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
    return res.status(401).json({
      error: "未配置 API Key。请在左下角设置中填入 Anthropic API Key，或启动前设置环境变量 ANTHROPIC_API_KEY。",
    });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (event) => res.write(JSON.stringify(event) + "\n");

  try {
    await generate({ messages, apiKey, model }, send);
  } catch (err) {
    let message = "生成失败，请重试。";
    if (err instanceof Anthropic.AuthenticationError) {
      message = "API Key 无效，请检查设置。";
    } else if (err instanceof Anthropic.RateLimitError) {
      message = "请求过于频繁（已触发限流），请稍后重试。";
    } else if (err instanceof Anthropic.NotFoundError) {
      message = "所选模型不可用，请换一个模型。";
    } else if (err instanceof Anthropic.APIError) {
      message = `API 错误（${err.status}）：${err.message}`;
    } else if (err instanceof Anthropic.APIConnectionError) {
      message = "无法连接到 Anthropic API，请检查网络。";
    } else if (err?.message) {
      message = err.message;
    }
    send({ type: "error", message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  MagicCAD 已启动: http://localhost:${PORT}\n`);
});
