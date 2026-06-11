import { Viewer } from "./viewer.js";
import { runModelCode } from "./jscad-runner.js";
import { exportSTL, exportSVG, exportDXF } from "./export.js";

const $ = (sel) => document.querySelector(sel);

const el = {
  chat: $("#chat"),
  input: $("#input"),
  send: $("#send"),
  examples: $("#examples"),
  keySource: $("#key-source"),
  sharedHint: $("#shared-hint"),
  providerSelect: $("#provider-select"),
  anthropicSettings: $("#anthropic-settings"),
  openaiSettings: $("#openai-settings"),
  modelSelect: $("#model-select"),
  apiKey: $("#api-key"),
  openaiBaseUrl: $("#openai-base-url"),
  openaiModel: $("#openai-model"),
  openaiKey: $("#openai-key"),
  keyHint: $("#key-hint"),
  userName: $("#user-name"),
  adminLink: $("#admin-link"),
  changePassword: $("#change-password"),
  logout: $("#logout"),
  viewport: $("#viewport"),
  hudGrid: $("#hud-grid"),
  hudAxes: $("#hud-axes"),
  hudWireframe: $("#hud-wireframe"),
  hudProj: $("#hud-proj"),
  hudFit: $("#hud-fit"),
  gridInfo: $("#grid-info"),
  paramPanel: $("#param-panel"),
  paramList: $("#param-list"),
  paramCollapse: $("#param-collapse"),
  dropHint: $("#drop-hint"),
  codePanel: $("#code-panel"),
  codeArea: $("#code-area"),
  codeGutter: $("#code-gutter"),
  codeToggle: $("#code-toggle"),
  runCode: $("#run-code"),
  versionSelect: $("#version-select"),
  screenshot: $("#screenshot"),
  shareWork: $("#share-work"),
  shareModal: $("#share-modal"),
  shareClose: $("#share-close"),
  shareForm: $("#share-form"),
  shareTitle: $("#share-title"),
  shareDesc: $("#share-desc"),
  shareCoverRow: $("#share-cover-row"),
  shareCover: $("#share-cover"),
  shareRecapture: $("#share-recapture"),
  captureBar: $("#capture-bar"),
  captureDone: $("#capture-done"),
  captureCancel: $("#capture-cancel"),
  shareError: $("#share-error"),
  shareSubmit: $("#share-submit"),
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
  cropModal: $("#crop-modal"),
  cropClose: $("#crop-close"),
  cropStage: $("#crop-stage"),
  cropCanvas: $("#crop-canvas"),
  cropBox: $("#crop-box"),
  cropAll: $("#crop-all"),
  cropHint: $("#crop-hint"),
  cropError: $("#crop-error"),
  cropSubmit: $("#crop-submit"),
};

const viewer = new Viewer(el.viewport);

const state = {
  me: null,
  history: [], // [{role:'user'|'assistant', content}]
  geometries: [],
  busy: false,
  sessionId: null, // 当前会话 ID（首次生成成功后分配并持续保存）
  versions: [], // 代码版本快照 [{code, time}]
  auto2dView: false, // 当前视图是否因 2D 模型被自动切到顶视+正交
};

// ---------- 登录态 ----------

function gotoLogin() {
  location.href = "/login.html";
}

async function initAuth() {
  const resp = await fetch("/api/me");
  if (!resp.ok) {
    gotoLogin();
    return false;
  }
  state.me = (await resp.json()).user;
  el.userName.textContent = `👤 ${state.me.username}`;
  el.adminLink.hidden = state.me.role !== "admin";
  return true;
}

el.logout.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  gotoLogin();
});

el.changePassword.addEventListener("click", async () => {
  const oldPassword = prompt("请输入当前密码：");
  if (!oldPassword) return;
  const newPassword = prompt("请输入新密码（至少 6 位）：");
  if (!newPassword) return;
  const resp = await fetch("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const body = await resp.json().catch(() => ({}));
  alert(resp.ok ? "密码已修改" : body.error || "修改失败");
});

// ---------- 设置（保存到账户，Key 不回传浏览器） ----------

let llmConfig = null;

el.providerSelect.value = localStorage.getItem("magiccad.provider") || "anthropic";
el.keySource.value = localStorage.getItem("magiccad.keySource") || "own";

function applySettingsUI() {
  const provider = el.providerSelect.value;
  const shared = el.keySource.value === "shared";

  el.anthropicSettings.hidden = shared || provider !== "anthropic";
  el.openaiSettings.hidden = shared || provider !== "openai";
  el.keyHint.hidden = shared;
  el.sharedHint.hidden = !shared;

  if (!llmConfig) return;
  if (shared) {
    const cfg = llmConfig.shared;
    if (!cfg.allowed) {
      el.sharedHint.textContent = "⚠ 你的共享模型使用权已被管理员关闭，请使用自己的 API Key 或联系管理员。";
    } else if (!cfg[provider]) {
      el.sharedHint.textContent = "⚠ 管理员尚未启用该服务商的共享配置，请换一个服务商。";
    } else {
      el.sharedHint.textContent = "✓ 已授权使用平台共享模型，模型与 Key 由管理员统一配置。";
    }
  } else {
    el.apiKey.placeholder = llmConfig.anthropic.hasKey
      ? "已保存（输入新 Key 可覆盖）"
      : "sk-ant-...";
    el.openaiKey.placeholder = llmConfig.openai.hasKey
      ? "已保存（输入新 Key 可覆盖）"
      : "sk-...";
  }
}

async function loadLlmConfig() {
  const resp = await fetch("/api/llm/config");
  if (!resp.ok) return;
  llmConfig = await resp.json();

  el.modelSelect.innerHTML = llmConfig.anthropic.models
    .map((m) => `<option value="${m.id}">${m.label}</option>`)
    .join("");
  el.modelSelect.value = llmConfig.anthropic.model || llmConfig.anthropic.defaultModel;
  el.openaiBaseUrl.value = llmConfig.openai.baseUrl;
  el.openaiBaseUrl.placeholder = llmConfig.openai.defaultBaseUrl;
  el.openaiModel.value = llmConfig.openai.model;
  el.openaiModel.placeholder = llmConfig.openai.defaultModel;
  applySettingsUI();
}

async function saveProviderConfig(provider, extra = {}) {
  const base =
    provider === "anthropic"
      ? { model: el.modelSelect.value }
      : { model: el.openaiModel.value.trim(), baseUrl: el.openaiBaseUrl.value.trim() };
  try {
    await fetch("/api/llm/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...base, ...extra }),
    });
  } catch {
    setStatus("设置保存失败", "warn");
  }
}

// Key 输入后立即保存到账户并清空输入框（不在浏览器留存）
function bindKeyInput(input, provider) {
  input.addEventListener("change", async () => {
    const key = input.value.trim();
    if (!key) return;
    await saveProviderConfig(provider, { apiKey: key });
    input.value = "";
    if (llmConfig) llmConfig[provider].hasKey = true;
    applySettingsUI();
    setStatus("API Key 已保存到账户", "ok");
  });
}

bindKeyInput(el.apiKey, "anthropic");
bindKeyInput(el.openaiKey, "openai");

el.modelSelect.addEventListener("change", () => saveProviderConfig("anthropic"));
el.openaiModel.addEventListener("change", () => saveProviderConfig("openai"));
el.openaiBaseUrl.addEventListener("change", () => saveProviderConfig("openai"));

el.providerSelect.addEventListener("change", () => {
  localStorage.setItem("magiccad.provider", el.providerSelect.value);
  applySettingsUI();
});

el.keySource.addEventListener("change", () => {
  localStorage.setItem("magiccad.keySource", el.keySource.value);
  applySettingsUI();
});

function requestPayload() {
  const provider = el.providerSelect.value;
  const payload = { provider, keySource: el.keySource.value };
  if (provider === "openai") {
    payload.model = el.openaiModel.value.trim() || undefined;
    payload.baseUrl = el.openaiBaseUrl.value.trim() || undefined;
  } else {
    payload.model = el.modelSelect.value;
  }
  return payload;
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

/** 用户气泡：content 为字符串，或含图片的内容块数组（图片显示为缩略图） */
function addUserBubble(content) {
  if (typeof content === "string") return addBubble("user", content);
  const div = document.createElement("div");
  div.className = "bubble user";
  for (const b of content) {
    if (b.type === "image") {
      const img = document.createElement("img");
      img.className = "bubble-image";
      img.src = `data:${b.mediaType};base64,${b.data}`;
      img.alt = "上传的图片";
      div.appendChild(img);
    } else if (b.type === "text") {
      const t = document.createElement("div");
      t.textContent = b.text;
      div.appendChild(t);
    }
  }
  el.chat.appendChild(div);
  el.chat.scrollTop = el.chat.scrollHeight;
  return div;
}

/** 提取消息内容中的文字部分（内容块数组或字符串均可） */
function contentText(content) {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ");
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
  if (!text.trim()) return;
  return sendTurn(text);
}

/** 发送一轮用户消息。content 为字符串或内容块数组（含图片时） */
async function sendTurn(content) {
  if (state.busy) return;
  setBusy(true);
  setStatus("正在请求 AI…");

  // 提前分配会话 ID：服务端在任务开始时就把会话落库，关页也不丢
  if (!state.sessionId) state.sessionId = crypto.randomUUID();
  state.history.push({ role: "user", content });
  addUserBubble(content);
  const assistantBubble = addBubble("assistant", "");

  try {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        title: deriveTitle(),
        messages: state.history,
        ...requestPayload(),
      }),
    });

    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 401 && body.error === "请先登录") return gotoLogin();
      throw new Error(body.error || `请求失败（${resp.status}）`);
    }

    const visibleText = await consumeJobStream(body.jobId, assistantBubble);
    state.history.push({ role: "assistant", content: visibleText });
    applyAssistantResult(visibleText);
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

/** 旁听后台任务的事件流并渲染到气泡。成功返回回答正文，失败抛错 */
async function consumeJobStream(jobId, assistantBubble) {
  const placeholderDiv = document.createElement("div");
  placeholderDiv.textContent = "…";
  assistantBubble.appendChild(placeholderDiv);

  // 思考过程展示（默认收起，不进入对话历史）：
  // 1) 标准思考事件（Claude thinking / reasoning_content）→ 单个折叠块
  // 2) 模型在正文里输出的 <think>...</think> → 每对标签一个独立折叠块
  let eventThinking = null;
  const segEls = []; // <think> 分段对应的 DOM（分段只增不减，末段内容会持续更新）
  let rawText = "";

  const renderAssistant = () => {
    placeholderDiv.remove();
    const segments = splitThinkSegments(rawText);
    segments.forEach((seg, i) => {
      let entry = segEls[i];
      if (!entry || entry.type !== seg.type) {
        if (entry) entry.root.remove();
        entry = createAssistantSegment(seg.type);
        segEls[i] = entry;
        assistantBubble.appendChild(entry.root);
      }
      if (seg.type === "text") {
        entry.root.textContent = stripCodeForDisplay(seg.text);
      } else {
        entry.body.textContent = seg.text.trim();
        entry.summary.textContent = seg.closed ? "💭 思考过程" : "💭 思考中…";
      }
    });
    el.chat.scrollTop = el.chat.scrollHeight;
  };

  const resp = await fetch(`/api/jobs/${jobId}/stream`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error || `连接生成任务失败（${resp.status}）`);
  }

  // 解析 NDJSON 流（先回放任务已产生的事件，再续实时）
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
      if (event.type === "thinking") {
        if (!eventThinking) {
          eventThinking = createAssistantSegment("think");
          eventThinking.text = "";
          assistantBubble.insertBefore(eventThinking.root, assistantBubble.firstChild);
        }
        eventThinking.text += event.text;
        eventThinking.body.textContent = eventThinking.text;
        el.chat.scrollTop = el.chat.scrollHeight;
        setStatus("AI 正在思考…");
      } else if (event.type === "text") {
        rawText += event.text;
        if (eventThinking) eventThinking.summary.textContent = "💭 思考过程";
        renderAssistant();
        setStatus("AI 正在生成模型代码…");
      } else if (event.type === "error") {
        streamError = event.message;
      } else if (event.type === "done" && event.stopReason === "refusal") {
        streamError = "该请求被模型安全策略拒绝，请换一种描述方式。";
      }
    }
  }
  if (streamError) throw new Error(streamError);
  // 思考内容（标签内或事件流）不写入历史、不回传模型
  const visibleText = stripThink(rawText);
  if (!visibleText.trim()) throw new Error("模型没有返回内容，请重试。");

  renderAssistant();
  for (const entry of segEls) {
    if (entry?.type === "think") entry.summary.textContent = "💭 思考过程";
  }
  if (eventThinking) eventThinking.summary.textContent = "💭 思考过程";
  return visibleText;
}

/** 生成成功后的统一处理：提取代码、保存会话、构建模型 */
function applyAssistantResult(visibleText) {
  const code = extractCode(visibleText)?.trim();
  if (code) {
    el.codeArea.value = code;
    updateGutter();
  }
  saveSession();
  if (!code) {
    setStatus("回复中没有建模代码", "warn");
    return;
  }
  buildFromCode(code, { fromAI: true });
}

/** 页面加载时续接仍在运行的后台任务（上次关页前未完成的生成） */
async function resumeActiveJob() {
  let job;
  try {
    job = await (await fetch("/api/jobs/active")).json();
  } catch {
    return;
  }
  if (!job?.jobId) return;

  await loadSession(job.sessionId); // 会话里已含本轮用户消息
  setBusy(true);
  setStatus("正在续接后台生成…");
  const assistantBubble = addBubble("assistant", "");
  try {
    const visibleText = await consumeJobStream(job.jobId, assistantBubble);
    state.history.push({ role: "assistant", content: visibleText });
    applyAssistantResult(visibleText);
  } catch (err) {
    assistantBubble.remove();
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

/** 把正文按 <think>...</think> 切分为交替的 text / think 分段（末段允许未闭合） */
function splitThinkSegments(raw) {
  const segments = [];
  let rest = raw;
  while (true) {
    const open = rest.indexOf("<think>");
    if (open === -1) {
      segments.push({ type: "text", text: rest });
      break;
    }
    if (open > 0) segments.push({ type: "text", text: rest.slice(0, open) });
    const close = rest.indexOf("</think>", open);
    if (close === -1) {
      segments.push({ type: "think", text: rest.slice(open + 7), closed: false });
      break;
    }
    segments.push({ type: "think", text: rest.slice(open + 7, close), closed: true });
    rest = rest.slice(close + 8);
  }
  return segments;
}

/** 去掉 <think> 标签内容（含未闭合的），得到真正的回答正文 */
function stripThink(text) {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
}

/** 助手气泡分段元素：text 为普通 div，think 为默认收起的折叠块 */
function createAssistantSegment(type) {
  if (type === "text") {
    return { type, root: document.createElement("div") };
  }
  const root = document.createElement("details");
  root.className = "bubble-thinking";
  const summary = document.createElement("summary");
  summary.textContent = "💭 思考中…";
  const body = document.createElement("div");
  body.className = "thinking-body";
  root.append(summary, body);
  return { type, root, summary, body };
}

// ---------- 构建与渲染 ----------

function buildFromCode(code, { fromAI = false, snapshot = true, quiet = false } = {}) {
  try {
    const { geometries, kinds } = runModelCode(code);
    state.geometries = geometries;
    const info = viewer.setGeometries(geometries);
    el.exportStl.disabled = !kinds.has3d;
    el.exportSvg.disabled = !kinds.has2d;
    el.exportDxf.disabled = !kinds.has2d;
    el.shareWork.disabled = false;
    el.screenshot.disabled = false;

    applyAutoView(kinds);
    updateGridInfo(info.gridSpacing);
    highlightErrorLine(null);
    if (snapshot) pushVersion(code);
    if (!quiet) renderParamPanel(code);

    setStatus(
      `已生成 ${geometries.length} 个几何体（${[
        kinds.has3d ? "3D" : null,
        kinds.has2d ? "2D" : null,
      ]
        .filter(Boolean)
        .join(" + ")}）· ${formatDims(info.size, kinds)}`,
      "ok"
    );
    return true;
  } catch (err) {
    setStatus(
      err.line ? `代码执行出错（第 ${err.line} 行）` : "代码执行出错",
      "error"
    );
    highlightErrorLine(err.line);
    if (quiet) return false;
    if (fromAI) {
      addErrorCard(
        `模型代码执行出错：${err.message}`,
        `执行报错：${err.message}\n请修复并输出完整代码。`
      );
    } else {
      addErrorCard(`代码执行出错：${err.message}`);
    }
    return false;
  }
}

function formatDims(size, kinds) {
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  return kinds.has3d
    ? `${fmt(size[0])} × ${fmt(size[1])} × ${fmt(size[2])} mm`
    : `${fmt(size[0])} × ${fmt(size[1])} mm`;
}

/** 2D 图形自动切到顶视+正交，回到 3D 时还原透视等轴测 */
function applyAutoView(kinds) {
  if (kinds.has2d && !kinds.has3d) {
    viewer.setProjection("ortho");
    viewer.setStandardView("top");
    state.auto2dView = true;
  } else if (state.auto2dView) {
    viewer.setProjection("persp");
    viewer.setStandardView("iso");
    state.auto2dView = false;
  }
  syncHud();
}

function updateGridInfo(spacing) {
  const fmt = spacing >= 1 ? spacing.toString() : spacing.toFixed(1);
  el.gridInfo.textContent = `网格 ${fmt} mm`;
}

// ---------- 画布工具栏 ----------

function syncHud() {
  el.hudGrid.classList.toggle("active", viewer.gridVisible);
  el.hudAxes.classList.toggle("active", viewer.axesVisible);
  el.hudWireframe.classList.toggle("active", viewer.wireframe);
  el.hudProj.textContent = viewer.projection === "ortho" ? "正交" : "透视";
}

el.hudGrid.addEventListener("click", () => {
  viewer.setGridVisible(!viewer.gridVisible);
  syncHud();
});
el.hudAxes.addEventListener("click", () => {
  viewer.setAxesVisible(!viewer.axesVisible);
  syncHud();
});
el.hudWireframe.addEventListener("click", () => {
  viewer.setWireframe(!viewer.wireframe);
  syncHud();
});
el.hudProj.addEventListener("click", () => {
  viewer.setProjection(viewer.projection === "ortho" ? "persp" : "ortho");
  state.auto2dView = false;
  syncHud();
});
el.hudFit.addEventListener("click", () => viewer.fitView());

for (const name of ["iso", "top", "front", "right"]) {
  $(`#hud-view-${name}`).addEventListener("click", () => viewer.setStandardView(name));
}

// 画布快捷键（输入框聚焦或弹窗打开时不响应）
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (!el.captureBar.hidden && e.key === "Escape") {
    el.captureCancel.click();
    return;
  }
  if (!el.historyModal.hidden || !el.shareModal.hidden || !el.cropModal.hidden) return;
  const views = { 1: "iso", 2: "top", 3: "front", 4: "right" };
  const key = e.key.toLowerCase();
  if (views[key]) viewer.setStandardView(views[key]);
  else if (key === "f") viewer.fitView();
  else if (key === "g") el.hudGrid.click();
  else if (key === "a") el.hudAxes.click();
  else if (key === "w") el.hudWireframe.click();
  else if (key === "o") el.hudProj.click();
});

// ---------- 参数面板 ----------

const MAX_PARAMS = 14;
const PARAM_RE = /^[ \t]*const\s+([A-Za-z_$][\w$]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/gm;

function extractParams(code) {
  const params = [];
  for (const m of code.matchAll(PARAM_RE)) {
    params.push({ name: m[1], value: parseFloat(m[2]) });
    if (params.length >= MAX_PARAMS) break;
  }
  return params;
}

function replaceParam(code, name, value) {
  const escaped = name.replace(/\$/g, "\\$");
  const re = new RegExp(`(const\\s+${escaped}\\s*=\\s*)-?\\d+(?:\\.\\d+)?(\\s*;)`);
  return code.replace(re, `$1${value}$2`);
}

let paramRebuildTimer = null;

function renderParamPanel(code) {
  const params = extractParams(code);
  el.paramPanel.hidden = params.length === 0;
  el.paramList.innerHTML = "";
  if (params.length === 0) return;

  for (const p of params) {
    const row = document.createElement("div");
    row.className = "param-row";

    const label = document.createElement("label");
    label.textContent = p.name;
    label.title = p.name;

    const span = Math.abs(p.value) || 5;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = p.value < 0 ? -span * 3 : 0;
    slider.max = span * 3;
    slider.step = Number.isInteger(p.value) && span >= 5 ? 1 : span / 100;
    slider.value = p.value;

    const num = document.createElement("input");
    num.type = "number";
    num.step = "any";
    num.value = p.value;

    const apply = (value, immediate) => {
      if (!Number.isFinite(value)) return;
      value = Math.round(value * 1000) / 1000; // 避免滑块步进产生超长小数写进代码
      el.codeArea.value = replaceParam(el.codeArea.value, p.name, value);
      updateGutter();
      clearTimeout(paramRebuildTimer);
      const rebuild = () => {
        if (buildFromCode(el.codeArea.value, { snapshot: false, quiet: true })) {
          if (state.sessionId) saveSession();
        }
      };
      immediate ? rebuild() : (paramRebuildTimer = setTimeout(rebuild, 120));
    };

    slider.addEventListener("input", () => {
      num.value = slider.value;
      apply(parseFloat(slider.value), false);
    });
    num.addEventListener("change", () => {
      slider.value = num.value;
      apply(parseFloat(num.value), true);
    });

    row.append(label, slider, num);
    el.paramList.appendChild(row);
  }
}

el.paramCollapse.addEventListener("click", () => {
  el.paramPanel.classList.toggle("collapsed");
  el.paramCollapse.textContent = el.paramPanel.classList.contains("collapsed") ? "+" : "—";
});

// ---------- 版本快照 ----------

const MAX_VERSIONS = 20;

function pushVersion(code) {
  const last = state.versions[state.versions.length - 1];
  if (last && last.code === code) return;
  state.versions.push({ code, time: new Date() });
  if (state.versions.length > MAX_VERSIONS) state.versions.shift();
  renderVersionSelect(state.versions.length - 1);
}

function renderVersionSelect(selected) {
  el.versionSelect.hidden = state.versions.length < 2;
  el.versionSelect.innerHTML = state.versions
    .map((v, i) => {
      const t = `${String(v.time.getHours()).padStart(2, "0")}:${String(v.time.getMinutes()).padStart(2, "0")}`;
      return `<option value="${i}">V${i + 1} · ${t}</option>`;
    })
    .join("");
  el.versionSelect.value = String(selected);
}

el.versionSelect.addEventListener("change", () => {
  const v = state.versions[Number(el.versionSelect.value)];
  if (!v) return;
  el.codeArea.value = v.code;
  updateGutter();
  buildFromCode(v.code, { snapshot: false });
  setStatus(`已回退到 V${Number(el.versionSelect.value) + 1}`, "ok");
});

// ---------- 代码面板：行号 / 错误行 / 快捷键 ----------

let errorLine = null;

function updateGutter() {
  const lines = el.codeArea.value.split("\n").length;
  let html = "";
  for (let i = 1; i <= lines; i++) {
    html += `<div class="ln${i === errorLine ? " err" : ""}">${i}</div>`;
  }
  el.codeGutter.innerHTML = html;
  el.codeGutter.scrollTop = el.codeArea.scrollTop;
}

function highlightErrorLine(line) {
  errorLine = line || null;
  updateGutter();
  if (errorLine) {
    el.codePanel.classList.remove("collapsed");
    el.codeToggle.textContent = "代码 ▾";
    // 把出错行滚动到可视范围
    const lineHeight = parseFloat(getComputedStyle(el.codeArea).lineHeight) || 18;
    el.codeArea.scrollTop = Math.max(0, (errorLine - 4) * lineHeight);
    el.codeGutter.scrollTop = el.codeArea.scrollTop;
  }
}

el.codeArea.addEventListener("input", updateGutter);
el.codeArea.addEventListener("scroll", () => {
  el.codeGutter.scrollTop = el.codeArea.scrollTop;
});

el.codeArea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    el.runCode.click();
  } else if (e.key === "Tab") {
    e.preventDefault();
    el.codeArea.setRangeText("  ", el.codeArea.selectionStart, el.codeArea.selectionEnd, "end");
    updateGutter();
  }
});

// ---------- 分享到作品市场 ----------

let pendingCover = "";

el.shareWork.addEventListener("click", () => {
  if (!el.codeArea.value.trim()) return;
  el.shareTitle.value = deriveTitle();
  el.shareDesc.value = "";
  el.shareError.hidden = true;
  // 当前画布截图作为作品封面
  try {
    pendingCover = viewer.screenshot({ width: 480, type: "image/jpeg", quality: 0.85 });
    el.shareCover.src = pendingCover;
    el.shareCoverRow.hidden = false;
  } catch {
    pendingCover = "";
    el.shareCoverRow.hidden = true;
  }
  el.shareModal.hidden = false;
  el.shareTitle.focus();
});

el.shareClose.addEventListener("click", () => (el.shareModal.hidden = true));
el.shareModal.addEventListener("click", (e) => {
  if (e.target === el.shareModal) el.shareModal.hidden = true;
});

// 调整视角重拍：暂时收起弹窗让画布可操作，截完回到弹窗（表单内容保留）
el.shareRecapture.addEventListener("click", () => {
  el.shareModal.hidden = true;
  el.captureBar.hidden = false;
});

el.captureDone.addEventListener("click", () => {
  try {
    pendingCover = viewer.screenshot({ width: 480, type: "image/jpeg", quality: 0.85 });
    el.shareCover.src = pendingCover;
    el.shareCoverRow.hidden = false;
  } catch {
    // 截图失败保留原封面
  }
  el.captureBar.hidden = true;
  el.shareModal.hidden = false;
});

el.captureCancel.addEventListener("click", () => {
  el.captureBar.hidden = true;
  el.shareModal.hidden = false;
});

el.shareForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.shareSubmit.disabled = true;
  try {
    const resp = await fetch("/api/works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: el.shareTitle.value.trim(),
        description: el.shareDesc.value.trim(),
        code: el.codeArea.value,
        cover: pendingCover,
      }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(body.error || `发布失败（${resp.status}）`);
    el.shareModal.hidden = true;
    setStatus("已发布到作品市场", "ok");
  } catch (err) {
    el.shareError.textContent = err.message;
    el.shareError.hidden = false;
  } finally {
    el.shareSubmit.disabled = false;
  }
});

// 从作品市场「载入到工作台」带回的代码
function loadPendingWork() {
  const raw = localStorage.getItem("magiccad.pendingWork");
  if (!raw) return;
  localStorage.removeItem("magiccad.pendingWork");
  try {
    const { title, code } = JSON.parse(raw);
    el.codeArea.value = code;
    updateGutter();
    el.codePanel.classList.remove("collapsed");
    el.codeToggle.textContent = "代码 ▾";
    buildFromCode(code);
    addBubble("assistant", `已载入市场作品「${title}」，可以直接修改代码，或继续用对话改进它。`);
  } catch {
    // 忽略损坏数据
  }
}

// ---------- 历史记录 ----------

function deriveTitle() {
  const first = state.history.find((m) => m.role === "user");
  const text = first ? contentText(first.content).trim() : "";
  return text ? text.slice(0, 40) : first ? "图片建模会话" : "未命名会话";
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
      if (m.role === "assistant") addBubble("assistant", stripCodeForDisplay(m.content));
      else addUserBubble(m.content);
    }

    el.historyModal.hidden = true;
    state.versions = [];
    if (session.code) {
      el.codeArea.value = session.code;
      updateGutter();
      buildFromCode(session.code);
    } else {
      el.versionSelect.hidden = true;
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
      const info = viewer.showSTL(await file.arrayBuffer());
      state.geometries = [];
      el.exportStl.disabled = true;
      el.exportSvg.disabled = true;
      el.exportDxf.disabled = true;
      el.screenshot.disabled = false;
      updateGridInfo(info.gridSpacing);
      const fmt = (n) => (Math.round(n * 10) / 10).toString();
      setStatus(
        `已打开 ${file.name}（查看模式，导出不可用）· ${fmt(info.size[0])} × ${fmt(info.size[1])} × ${fmt(info.size[2])} mm`,
        "ok"
      );
    } else if (name.endsWith(".js")) {
      const code = await file.text();
      el.codeArea.value = code;
      updateGutter();
      el.codePanel.classList.remove("collapsed");
      el.codeToggle.textContent = "代码 ▾";
      buildFromCode(code);
    } else if (/\.(png|jpe?g|webp)$/.test(name)) {
      openCropModal(file);
    } else {
      setStatus("不支持的文件类型，请选择 .stl / .js / 图片文件", "warn");
    }
  } catch (err) {
    setStatus(`打开文件失败：${err.message}`, "error");
  }
}

// ---------- 图片框选 → AI 识别建模 ----------

const CROP_STAGE_W = 640;
const CROP_STAGE_H = 400;
const CROP_OUT_MAX = 1024; // 发给模型的图片最长边

const crop = {
  img: null, // 原图 Image
  scale: 1, // 显示尺寸 / 原始尺寸
  sel: null, // 选区（显示坐标）{x,y,w,h}
  mode: null, // 'draw' | 'move' | null
  origin: null, // draw 模式的固定角
  moveStart: null,
};

function openCropModal(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    crop.img = img;
    crop.scale = Math.min(
      CROP_STAGE_W / img.naturalWidth,
      CROP_STAGE_H / img.naturalHeight,
      1
    );
    const w = Math.max(1, Math.round(img.naturalWidth * crop.scale));
    const h = Math.max(1, Math.round(img.naturalHeight * crop.scale));
    el.cropCanvas.width = w;
    el.cropCanvas.height = h;
    el.cropCanvas.getContext("2d").drawImage(img, 0, 0, w, h);
    setCropSel({ x: 0, y: 0, w, h }); // 默认全选
    el.cropHint.value = "";
    el.cropError.hidden = true;
    el.cropModal.hidden = false;
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("图片加载失败", "error");
  };
  img.src = url;
}

/** 归一化（支持反向拖拽）并应用选区 */
function setCropSel({ x, y, w, h }) {
  const W = el.cropCanvas.width;
  const H = el.cropCanvas.height;
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const x1 = clamp(Math.min(x, x + w), 0, W);
  const x2 = clamp(Math.max(x, x + w), 0, W);
  const y1 = clamp(Math.min(y, y + h), 0, H);
  const y2 = clamp(Math.max(y, y + h), 0, H);
  crop.sel = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  Object.assign(el.cropBox.style, {
    left: `${x1}px`,
    top: `${y1}px`,
    width: `${x2 - x1}px`,
    height: `${y2 - y1}px`,
  });
  el.cropBox.hidden = false;
}

function cropPointer(e) {
  const rect = el.cropCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

el.cropStage.addEventListener("pointerdown", (e) => {
  if (!crop.img) return;
  e.preventDefault();
  const p = cropPointer(e);
  const handle = e.target.closest?.(".crop-handle");
  if (handle && crop.sel) {
    // 拖角调整：固定对角，等同于从对角重新画
    const s = crop.sel;
    const anchors = {
      nw: { x: s.x + s.w, y: s.y + s.h },
      ne: { x: s.x, y: s.y + s.h },
      sw: { x: s.x + s.w, y: s.y },
      se: { x: s.x, y: s.y },
    };
    crop.mode = "draw";
    crop.origin = anchors[handle.dataset.pos];
  } else if (e.target === el.cropBox && crop.sel) {
    crop.mode = "move";
    crop.moveStart = { ...p, sel: { ...crop.sel } };
  } else {
    crop.mode = "draw";
    crop.origin = p;
    setCropSel({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  el.cropStage.setPointerCapture(e.pointerId);
});

el.cropStage.addEventListener("pointermove", (e) => {
  if (!crop.mode) return;
  const p = cropPointer(e);
  if (crop.mode === "draw") {
    setCropSel({
      x: crop.origin.x,
      y: crop.origin.y,
      w: p.x - crop.origin.x,
      h: p.y - crop.origin.y,
    });
  } else if (crop.mode === "move") {
    const W = el.cropCanvas.width;
    const H = el.cropCanvas.height;
    const s = crop.moveStart.sel;
    const nx = Math.min(Math.max(s.x + p.x - crop.moveStart.x, 0), W - s.w);
    const ny = Math.min(Math.max(s.y + p.y - crop.moveStart.y, 0), H - s.h);
    setCropSel({ x: nx, y: ny, w: s.w, h: s.h });
  }
});

el.cropStage.addEventListener("pointerup", () => (crop.mode = null));
el.cropStage.addEventListener("pointercancel", () => (crop.mode = null));

el.cropAll.addEventListener("click", () => {
  setCropSel({ x: 0, y: 0, w: el.cropCanvas.width, h: el.cropCanvas.height });
});

el.cropClose.addEventListener("click", () => (el.cropModal.hidden = true));
el.cropModal.addEventListener("click", (e) => {
  if (e.target === el.cropModal) el.cropModal.hidden = true;
});

el.cropSubmit.addEventListener("click", () => {
  const showError = (msg) => {
    el.cropError.textContent = msg;
    el.cropError.hidden = false;
  };
  if (state.busy) return showError("正在生成中，请稍候再试");
  const s = crop.sel;
  if (!s || s.w < 8 || s.h < 8) return showError("请先框选一个有效区域");

  // 选区映射回原图坐标，裁剪并压缩到最长边 1024px 的 JPEG
  const inv = 1 / crop.scale;
  const sx = s.x * inv;
  const sy = s.y * inv;
  const sw = s.w * inv;
  const sh = s.h * inv;
  const outScale = Math.min(1, CROP_OUT_MAX / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * outScale));
  canvas.height = Math.max(1, Math.round(sh * outScale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // 透明 PNG 转 JPEG 时垫白底
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(crop.img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  const hint = el.cropHint.value.trim();
  const text = hint
    ? `请根据这张图片建模。补充说明：${hint}`
    : "请识别这张图片中的物体，生成对应的参数化模型（尺寸未知时自行估一个合理值并说明）。";

  el.cropModal.hidden = true;
  sendTurn([
    { type: "image", mediaType: "image/jpeg", data: dataUrl.split(",")[1] },
    { type: "text", text },
  ]);
});

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
  state.versions = [];
  el.versionSelect.hidden = true;
  el.chat.innerHTML = "";
  // 清空画布、代码与相关状态
  state.geometries = [];
  viewer.setGeometries([]);
  el.codeArea.value = "";
  highlightErrorLine(null);
  renderParamPanel("");
  el.exportStl.disabled = true;
  el.exportSvg.disabled = true;
  el.exportDxf.disabled = true;
  el.shareWork.disabled = true;
  el.screenshot.disabled = true;
  setStatus("就绪");
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

// 拖拽 .stl / .js 文件到画布直接打开
el.viewport.addEventListener("dragover", (e) => {
  e.preventDefault();
  el.viewport.classList.add("dropping");
});
el.viewport.addEventListener("dragleave", (e) => {
  if (e.target === el.viewport || e.target === el.dropHint) {
    el.viewport.classList.remove("dropping");
  }
});
el.viewport.addEventListener("drop", (e) => {
  e.preventDefault();
  el.viewport.classList.remove("dropping");
  const file = e.dataTransfer.files?.[0];
  if (file) openLocalFile(file);
});

el.screenshot.addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = viewer.screenshot();
  a.download = `magiccad-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
  a.click();
  setStatus("已保存截图", "ok");
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

// ---------- 启动 ----------

(async function start() {
  if (!(await initAuth())) return;
  applySettingsUI();
  loadLlmConfig();
  syncHud();
  updateGutter();
  updateGridInfo(viewer.gridSpacing);
  addBubble(
    "assistant",
    `你好，${state.me.username}！用一句话描述你想要的 2D 图形或 3D 模型，我会生成可预览、可导出的参数化模型。做出满意的作品后，可以「分享到市场」给大家。`
  );
  loadPendingWork();
  resumeActiveJob(); // 若有上次关页前未完成的生成任务，自动续接
})();
