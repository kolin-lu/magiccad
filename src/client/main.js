import { Viewer } from "./viewer.js";
import { runModelCode } from "./jscad-runner.js";
import { exportSTL, exportSVG, exportDXF } from "./export.js";

const $ = (sel) => document.querySelector(sel);

const el = {
  chat: $("#chat"),
  input: $("#input"),
  send: $("#send"),
  examples: $("#examples"),
  providerSelect: $("#provider-select"),
  anthropicSettings: $("#anthropic-settings"),
  openaiSettings: $("#openai-settings"),
  modelSelect: $("#model-select"),
  apiKey: $("#api-key"),
  openaiBaseUrl: $("#openai-base-url"),
  openaiModel: $("#openai-model"),
  openaiKey: $("#openai-key"),
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
  historyBtn: $("#history-btn"),
  historyModal: $("#history-modal"),
  historyList: $("#history-list"),
  historyClose: $("#history-close"),
  openFile: $("#open-file"),
  fileInput: $("#file-input"),
};

const viewer = new Viewer(el.viewport);

const state = {
  history: [], // [{role:'user'|'assistant', content}]
  geometries: [],
  busy: false,
  sessionId: null, // 当前会话 ID（首次生成成功后分配并持续保存）
};

// ---------- 设置（localStorage 持久化） ----------

let serverConfig = null;

function bindSetting(input, key) {
  input.value = localStorage.getItem(key) || "";
  input.addEventListener("change", () => {
    localStorage.setItem(key, input.value.trim());
  });
}

bindSetting(el.apiKey, "magiccad.apiKey");
bindSetting(el.openaiBaseUrl, "magiccad.openai.baseUrl");
bindSetting(el.openaiModel, "magiccad.openai.model");
bindSetting(el.openaiKey, "magiccad.openai.apiKey");

el.providerSelect.value = localStorage.getItem("magiccad.provider") || "anthropic";

function applyProviderUI() {
  const provider = el.providerSelect.value;
  el.anthropicSettings.hidden = provider !== "anthropic";
  el.openaiSettings.hidden = provider !== "openai";
  const cfg = serverConfig?.[provider];
  el.keyHint.textContent = cfg?.hasEnvKey
    ? "已从环境变量读取 API Key，此处可留空"
    : "Key 仅保存在本机浏览器中，并只发送给本地服务";
}

el.providerSelect.addEventListener("change", () => {
  localStorage.setItem("magiccad.provider", el.providerSelect.value);
  applyProviderUI();
});
applyProviderUI();

fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    serverConfig = cfg;
    el.modelSelect.innerHTML = cfg.anthropic.models
      .map((m) => `<option value="${m.id}">${m.label}</option>`)
      .join("");
    el.modelSelect.value =
      localStorage.getItem("magiccad.model") || cfg.anthropic.defaultModel;
    if (!el.openaiBaseUrl.value) el.openaiBaseUrl.placeholder = cfg.openai.defaultBaseUrl;
    if (!el.openaiModel.value) el.openaiModel.placeholder = cfg.openai.defaultModel;
    applyProviderUI();
  })
  .catch(() => setStatus("无法连接本地服务", "error"));

el.modelSelect.addEventListener("change", () => {
  localStorage.setItem("magiccad.model", el.modelSelect.value);
});

function requestPayload() {
  const provider = el.providerSelect.value;
  if (provider === "openai") {
    return {
      provider,
      apiKey: el.openaiKey.value.trim() || undefined,
      model: el.openaiModel.value.trim() || undefined,
      baseUrl: el.openaiBaseUrl.value.trim() || undefined,
    };
  }
  return {
    provider,
    apiKey: el.apiKey.value.trim() || undefined,
    model: el.modelSelect.value,
  };
}

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
        ...requestPayload(),
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
    if (code) el.codeArea.value = code.trim();
    saveSession();
    if (!code) {
      setStatus("回复中没有建模代码", "warn");
      return;
    }
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

// ---------- 历史记录 ----------

function deriveTitle() {
  const first = state.history.find((m) => m.role === "user");
  return first ? first.content.slice(0, 40) : "未命名会话";
}

async function saveSession() {
  if (state.history.length === 0) return;
  if (!state.sessionId) state.sessionId = crypto.randomUUID();
  try {
    await fetch(`/api/sessions/${state.sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: deriveTitle(),
        messages: state.history,
        code: el.codeArea.value,
      }),
    });
  } catch {
    // 保存失败不打断使用
  }
}

async function openHistoryModal() {
  el.historyModal.hidden = false;
  el.historyList.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const sessions = await (await fetch("/api/sessions")).json();
    if (sessions.length === 0) {
      el.historyList.innerHTML = '<div class="empty">还没有历史会话</div>';
      return;
    }
    el.historyList.innerHTML = "";
    for (const s of sessions) {
      el.historyList.appendChild(renderHistoryItem(s));
    }
  } catch {
    el.historyList.innerHTML = '<div class="empty">加载失败</div>';
  }
}

function renderHistoryItem(s) {
  const item = document.createElement("div");
  item.className = "history-item";

  const info = document.createElement("div");
  info.className = "info";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = s.title;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${formatTime(s.updatedAt)} · ${s.messageCount} 条消息${s.hasCode ? " · 含模型代码" : ""}`;
  info.append(title, meta);
  info.addEventListener("click", () => loadSession(s.id));

  const loadBtn = document.createElement("button");
  loadBtn.className = "load-btn";
  loadBtn.textContent = "载入";
  loadBtn.addEventListener("click", () => loadSession(s.id));

  const delBtn = document.createElement("button");
  delBtn.className = "del-btn";
  delBtn.textContent = "删除";
  delBtn.addEventListener("click", async () => {
    if (!confirm(`删除会话「${s.title}」？`)) return;
    await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
    if (state.sessionId === s.id) state.sessionId = null;
    item.remove();
    if (!el.historyList.children.length) {
      el.historyList.innerHTML = '<div class="empty">还没有历史会话</div>';
    }
  });

  item.append(info, loadBtn, delBtn);
  return item;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function loadSession(id) {
  try {
    const resp = await fetch(`/api/sessions/${id}`);
    if (!resp.ok) throw new Error("会话不存在");
    const session = await resp.json();

    state.sessionId = session.id;
    state.history = session.messages || [];
    el.chat.innerHTML = "";
    for (const m of state.history) {
      addBubble(m.role, m.role === "assistant" ? stripCodeForDisplay(m.content) : m.content);
    }

    el.historyModal.hidden = true;
    if (session.code) {
      el.codeArea.value = session.code;
      buildFromCode(session.code);
    } else {
      setStatus("已载入会话", "ok");
    }
  } catch (err) {
    setStatus(`载入失败：${err.message}`, "error");
  }
}

// ---------- 打开文件 ----------

async function openLocalFile(file) {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".stl")) {
      viewer.showSTL(await file.arrayBuffer());
      state.geometries = [];
      el.exportStl.disabled = true;
      el.exportSvg.disabled = true;
      el.exportDxf.disabled = true;
      setStatus(`已打开 ${file.name}（查看模式，导出不可用）`, "ok");
    } else if (name.endsWith(".js")) {
      const code = await file.text();
      el.codeArea.value = code;
      el.codePanel.classList.remove("collapsed");
      el.codeToggle.textContent = "代码 ▾";
      buildFromCode(code);
    } else {
      setStatus("不支持的文件类型，请选择 .stl 或 .js 文件", "warn");
    }
  } catch (err) {
    setStatus(`打开文件失败：${err.message}`, "error");
  }
}

// ---------- 事件绑定 ----------

el.historyBtn.addEventListener("click", openHistoryModal);
el.historyClose.addEventListener("click", () => (el.historyModal.hidden = true));
el.historyModal.addEventListener("click", (e) => {
  if (e.target === el.historyModal) el.historyModal.hidden = true;
});

el.openFile.addEventListener("click", () => el.fileInput.click());
el.fileInput.addEventListener("change", () => {
  const file = el.fileInput.files[0];
  el.fileInput.value = "";
  if (file) openLocalFile(file);
});

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
  state.sessionId = null;
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
  if (state.sessionId) saveSession();
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
