import { Viewer } from "./viewer.js";
import { runModelCode } from "./jscad-runner.js";

// i18n：t() 由 public/i18n.js 提供（中文为源语言），异常时退化为原样输出
const t =
  window.t ||
  ((s, ...args) => args.reduce((out, a, i) => out.replaceAll(`{${i}}`, a), s));

const $ = (sel) => document.querySelector(sel);

const el = {
  user: $("#market-user"),
  grid: $("#works-grid"),
  modal: $("#work-modal"),
  close: $("#work-close"),
  title: $("#work-title"),
  preview: $("#work-preview"),
  meta: $("#work-meta"),
  desc: $("#work-desc"),
  like: $("#work-like"),
  load: $("#work-load"),
  del: $("#work-delete"),
  code: $("#work-code"),
};

let me = null;
let viewer = null; // 弹窗预览复用同一个 Viewer 实例
let currentWork = null;

async function init() {
  const resp = await fetch("/api/me");
  if (!resp.ok) {
    location.href = "/login.html";
    return;
  }
  me = (await resp.json()).user;
  el.user.textContent = `👤 ${me.username}`;
  await refreshList();
}

async function refreshList() {
  el.grid.innerHTML = `<div class="empty">${t("加载中…")}</div>`;
  try {
    const works = await (await fetch("/api/works")).json();
    if (!works.length) {
      el.grid.innerHTML =
        `<div class="empty">${t("还没有作品。在工作台生成模型后，点「分享到市场」发布第一个作品吧！")}</div>`;
      return;
    }
    el.grid.innerHTML = "";
    for (const w of works) el.grid.appendChild(renderCard(w));
  } catch {
    el.grid.innerHTML = `<div class="empty">${t("加载失败，请刷新重试")}</div>`;
  }
}

function renderCard(w) {
  const card = document.createElement("div");
  card.className = "work-item";

  let coverEl;
  if (w.cover) {
    coverEl = document.createElement("img");
    coverEl.className = "cover";
    coverEl.src = w.cover;
    coverEl.alt = w.title;
    coverEl.loading = "lazy";
  } else {
    coverEl = document.createElement("div");
    coverEl.className = "cover placeholder";
    coverEl.textContent = "◇";
  }
  coverEl.addEventListener("click", () => openWork(w.id));

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = w.title;

  const desc = document.createElement("div");
  desc.className = "desc";
  desc.textContent = w.description || t("（没有简介）");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${w.author}${w.mine ? t("（我）") : ""} · ${formatTime(w.createdAt)}`;

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const likeBtn = document.createElement("button");
  likeBtn.className = "like-btn" + (w.liked ? " liked" : "");
  likeBtn.textContent = `${w.liked ? "♥" : "♡"} ${w.likes}`;
  likeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const r = await toggleLike(w.id);
    if (r) {
      w.liked = r.liked;
      w.likes = r.likes;
      likeBtn.classList.toggle("liked", r.liked);
      likeBtn.textContent = `${r.liked ? "♥" : "♡"} ${r.likes}`;
    }
  });

  const viewBtn = document.createElement("button");
  viewBtn.className = "view-btn";
  viewBtn.textContent = t("查看");
  viewBtn.addEventListener("click", () => openWork(w.id));

  footer.append(likeBtn, viewBtn);
  card.append(coverEl, title, desc, meta, footer);
  card.addEventListener("click", (e) => {
    if (e.target === card || e.target === title || e.target === desc || e.target === meta) {
      openWork(w.id);
    }
  });
  return card;
}

async function toggleLike(id) {
  try {
    const resp = await fetch(`/api/works/${id}/like`, { method: "POST" });
    return resp.ok ? await resp.json() : null;
  } catch {
    return null;
  }
}

async function openWork(id) {
  try {
    const resp = await fetch(`/api/works/${id}`);
    if (!resp.ok) throw new Error(t("作品不存在"));
    const w = await resp.json();
    currentWork = w;

    el.title.textContent = w.title;
    el.meta.textContent = t("作者：{0} · {1}", w.author, formatTime(w.createdAt));
    el.desc.textContent = w.description || t("（没有简介）");
    el.code.textContent = w.code;
    el.like.textContent = `${w.liked ? t("♥ 已赞") : t("♡ 点赞")}（${w.likes}）`;
    el.like.classList.toggle("liked", w.liked);
    el.del.hidden = !(w.mine || me.role === "admin");
    el.modal.hidden = false;

    if (!viewer) viewer = new Viewer(el.preview);
    try {
      const { geometries } = runModelCode(w.code);
      viewer.setGeometries(geometries);
    } catch (err) {
      viewer.setGeometries([]);
      el.desc.textContent += t("\n（预览失败：{0}）", err.message);
    }
  } catch (err) {
    alert(err.message);
  }
}

el.close.addEventListener("click", () => (el.modal.hidden = true));
el.modal.addEventListener("click", (e) => {
  if (e.target === el.modal) el.modal.hidden = true;
});

el.like.addEventListener("click", async () => {
  if (!currentWork) return;
  const r = await toggleLike(currentWork.id);
  if (r) {
    currentWork.liked = r.liked;
    currentWork.likes = r.likes;
    el.like.textContent = `${r.liked ? t("♥ 已赞") : t("♡ 点赞")}（${r.likes}）`;
    el.like.classList.toggle("liked", r.liked);
    refreshList();
  }
});

el.load.addEventListener("click", () => {
  if (!currentWork) return;
  // 通过 localStorage 把作品代码带回工作台，由 main.js 启动时载入
  localStorage.setItem(
    "magiccad.pendingWork",
    JSON.stringify({ title: currentWork.title, code: currentWork.code })
  );
  location.href = "/";
});

el.del.addEventListener("click", async () => {
  if (!currentWork) return;
  if (!confirm(t("删除作品「{0}」？", currentWork.title))) return;
  const resp = await fetch(`/api/works/${currentWork.id}`, { method: "DELETE" });
  if (resp.ok) {
    el.modal.hidden = true;
    refreshList();
  } else {
    const body = await resp.json().catch(() => ({}));
    alert(body.error || t("删除失败"));
  }
});

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

init();
