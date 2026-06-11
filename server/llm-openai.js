import OpenAI from "openai";
import { SYSTEM_PROMPT, EFFORT_PROMPTS } from "./llm.js";

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-4o";

/** 中立内容块（{type:'image',mediaType,data} / {type:'text',text}）→ OpenAI 消息内容 */
function toOpenAIContent(content) {
  if (typeof content === "string") return content;
  return content.map((b) =>
    b.type === "image"
      ? { type: "image_url", image_url: { url: `data:${b.mediaType};base64,${b.data}` } }
      : { type: "text", text: b.text }
  );
}

/**
 * 通过 OpenAI 协议（chat completions）流式生成建模代码。
 * 兼容任何 OpenAI 协议服务：OpenAI 官方、DeepSeek、通义千问、Moonshot、本地 Ollama/vLLM 等。
 * 事件格式与 Anthropic 路径一致：{type:'text'} / {type:'done'} / 抛错由上层统一处理。
 */
export async function generateOpenAI(
  { messages, apiKey, model, baseUrl, showThinking = false, effort = "balanced", signal },
  onEvent
) {
  const client = new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY,
    baseURL: baseUrl || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
  });

  // OpenAI 协议没有跨服务商通用的思考控制参数（DeepSeek-R1 等模型思考长度随机），
  // 精度档位只能通过系统提示词约束
  const system = SYSTEM_PROMPT + (EFFORT_PROMPTS[effort] || "");

  const stream = await client.chat.completions.create(
    {
      model: model || process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      stream: true,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })),
      ],
    },
    { signal }
  );

  let finishReason = null;
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    // DeepSeek-R1 / Qwen 等推理模型的思考增量字段（非标准扩展）
    const reasoning = choice.delta?.reasoning_content;
    if (showThinking && typeof reasoning === "string" && reasoning) {
      onEvent({ type: "thinking", text: reasoning });
    }
    const delta = choice.delta?.content;
    if (delta) onEvent({ type: "text", text: delta });
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  onEvent({
    type: "done",
    // 对齐 Anthropic 的语义：content_filter 视为拒绝
    stopReason: finishReason === "content_filter" ? "refusal" : finishReason,
  });
}
