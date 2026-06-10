import { Viewer } from "./viewer.js";
import { runModelCode } from "./jscad-runner.js";
import { exportSTL, exportSVG, exportDXF } from "./export.js";

const $ = (sel) => document.querySelector(sel);

const el = {
  chat: $("#chat"),
  input: $("#input"),
  send: $("#send"),
  examples: $("#examples"),
  modelSelect: $("#model-select"),
  apiKey: $("#api-key"),
  keyHint: $("#key-hint"),
  viewport: $("#viewport"),
  codePanel: $("#code-panel"),
  codeArea: $("#code-area"),
  codeToggle: $("#code-toggle"),
  runCode: $("#run-code"),
  exportStl: $("#export-stl"),
  exportSvg: $("#export-svg"),
  exportDxf: $("#export-dxf"),
  status: $("#status"),
  clearChat: $("#clear-chat"),
};

const viewer = new Viewer(el.viewport);

const state = {
  history: [], // [{role:'user'|'assistant', content}]
  geometries: [],
  busy: false,
};

// ---------- 设置（localStorage 持久化） ----------

el.apiKey.value = localStorage.getItem("magiccad.apiKey") || "";
el.apiKey.addEventListener("change", () => {
  localStorage.setItem("magiccad.apiKey", el.apiKey.value.trim());
});

fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    el.modelSelect.innerHTML = cfg.models
      .map((m) => `<option value="${m.id}">${m.label}</option>`)
      .join("");
    el.modelSelect.value =
      localStorage.getItem("magiccad.model") || cfg.defaultModel;
    if (cfg.hasEnvKey) {
      el.keyHint.textContent = "已从环境变量读取 API Key，此处可留空";
    }
  })
  .catch(() => setStatus("无法连接本地服务", "error"));

el.modelSelect.addEventListener("change", () => {
  localStorage.setItem("magiccad.model", el.modelSelect.value);
});

// ---------- 聊天 ----------

function addBubble(role, text = "") {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  el.chat.appendChild(div);
  el.chat.scrollTop = el.chat.scrollHeight;
  return div;
}

function addErrorCard(message, fixPrompt) {
  const card = document.createElement("div");
  card.className = "bubble error-card";
  const p = document.createElement("div");
  p.textContent = message;
  card.appendChild(p);
  if (fixPrompt) {
    const btn = document.createElement("button");
    btn.textContent = "让 AI 修复";
    btn.className = "fix-btn";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      sendMessage(fixPrompt);
    });
    card.appendChild(btn);
  }
  el.chat.appendChild(card);
  el.chat.scrollTop = el.chat.scrollHeight;
}

function setStatus(text, kind = "") {
  el.status.textContent = text;
  el.status.className = kind;
}

function setBusy(busy) {
  state.busy = busy;
  el.send.disabled = busy;
  el.input.disabled = busy;
  el.send.textContent = busy ? "生成中…" : "发送";
}

function extractCode(text) {
  const matches = [...text.matchAll(/```(?:javascript|js)?\s*\n([\s\S]*?)```/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

async function sendMessage(text) {
  if (state.busy || !text.trim()) return;
  setBusy(true);
  setStatus("正在请求 AI…");

  state.history.push({ role: "user", content: text });
  addBubble("user", text);
  const assistantBubble = addBubble("assistant", "…");

  let fullText = "";
  try {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: state.history,
        apiKey: el.apiKey.value.trim() || undefined,
        model: el.modelSelect.value,
      }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error || `请求失败（${resp.status}）`);
    }

    // 解析 NDJSON 流
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "text") {
          fullText += event.text;
          assistantBubble.textContent = stripCodeForDisplay(fullText);
          el.chat.scrollTop = el.chat.scrollHeight;
          setStatus("AI 正在生成模型代码…");
        } else if (event.type === "error") {
          streamError = event.message;
        } else if (event.type === "done" && event.stopReason === "refusal") {
          streamError = "该请求被模型安全策略拒绝，请换一种描述方式。";
        }
      }
    }
    if (streamError) throw new Error(streamError);
    if (!fullText.trim()) throw new Error("模型没有返回内容，请重试。");

    state.history.push({ role: "assistant", content: fullText });
    assistantBubble.textContent = stripCodeForDisplay(fullText);

    const code = extractCode(fullText);
    if (!code) {
      setStatus("回复中没有建模代码", "warn");
      return;
    }
    el.codeArea.value = code.trim();
    buildFromCode(code, { fromAI: true });
  } catch (err) {
    assistantBubble.remove();
    // 失败的轮次从历史中移除，避免污染上下文
    if (state.history[state.history.length - 1]?.role === "user") {
      state.history.pop();
    }
    addErrorCard(err.message);
    setStatus("生成失败", "error");
  } finally {
    setBusy(false);
  }
}

/** 聊天气泡里隐藏大段代码，只显示说明文字 */
function stripCodeForDisplay(text) {
  return text.replace(/```(?:javascript|js)?\s*\n[\s\S]*?(```|$)/g, "〔已生成建模代码 →〕").trim();
}

// ---------- 构建与渲染 ----------

function buildFromCode(code, { fromAI = false } = {}) {
  try {
    const { geometries, kinds } = runModelCode(code);
    state.geometries = geometries;
    viewer.setGeometries(geometries);
    el.exportStl.disabled = !kinds.has3d;
    el.exportSvg.disabled = !kinds.has2d;
    el.exportDxf.disabled = !kinds.has2d;
    setStatus(
      `已生成 ${geometries.length} 个几何体（${[
        kinds.has3d ? "3D" : null,
        kinds.has2d ? "2D" : null,
      ]
        .filter(Boolean)
        .join(" + ")}）`,
      "ok"
    );
  } catch (err) {
    setStatus("代码执行出错", "error");
    if (fromAI) {
      addErrorCard(
        `模型代码执行出错：${err.message}`,
        `执行报错：${err.message}\n请修复并输出完整代码。`
      );
    } else {
      addErrorCard(`代码执行出错：${err.message}`);
    }
  }
}

// ---------- 事件绑定 ----------

el.send.addEventListener("click", () => {
  const text = el.input.value;
  el.input.value = "";
  sendMessage(text);
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    el.send.click();
  }
});

el.examples.addEventListener("click", (e) => {
  if (e.target.matches("[data-prompt]")) {
    el.input.value = e.target.dataset.prompt;
    el.send.click();
  }
});

el.clearChat.addEventListener("click", () => {
  state.history = [];
  el.chat.innerHTML = "";
  addBubble("assistant", "已开启新会话。描述你想要的模型吧！");
});

el.codeToggle.addEventListener("click", () => {
  el.codePanel.classList.toggle("collapsed");
  el.codeToggle.textContent = el.codePanel.classList.contains("collapsed")
    ? "代码 ▴"
    : "代码 ▾";
});

el.runCode.addEventListener("click", () => {
  buildFromCode(el.codeArea.value);
});

el.exportStl.addEventListener("click", () => safeExport(() => exportSTL(state.geometries)));
el.exportSvg.addEventListener("click", () => safeExport(() => exportSVG(state.geometries)));
el.exportDxf.addEventListener("click", () => safeExport(() => exportDXF(state.geometries)));

function safeExport(fn) {
  try {
    fn();
    setStatus("已导出", "ok");
  } catch (err) {
    setStatus(err.message, "error");
  }
}

addBubble(
  "assistant",
  "你好！我是 MagicCAD。用一句话描述你想要的 2D 图形或 3D 模型，我会生成可预览、可导出的参数化模型。"
);
