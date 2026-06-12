<div align="center">

# ⚙️ MagicCAD

**An AI modeling platform that turns natural language into 2D drawings and 3D models**

[![Node](https://img.shields.io/badge/Node.js-%E2%89%A5%2022.5-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.2_Beta-d8b04a)]()

[简体中文](README.md) | **English**

Type "a flange with 6 mounting holes" — the AI writes parametric modeling code,<br>
rendered live in the browser and exportable as **STL** (3D printing) / **SVG / DXF** (laser cutting, CAD drawings)

</div>

---

## 🔍 How It Works

```
Natural language / images / annotated screenshots
        │
        ▼
 LLM (Claude / any OpenAI-protocol model)
        │  generates JSCAD parametric modeling code
        ▼
 Executed in the browser (@jscad/modeling builds the geometry)
        │
        ├──▶ Three.js live 3D/2D preview (orbit / zoom / parameter sliders)
        └──▶ Export STL / SVG / DXF
```

The output is **code, not a mesh** — so every model is parametric. Edit dimension
constants in the code panel, drag parameter sliders, or just keep talking to the AI
("make the hole 10 mm", "add a fillet all around").

## ✨ Features

### 🤖 AI Modeling

| Feature | Description |
|---|---|
| 💬 Multi-turn modeling | Iterate on the current model: "bigger fillets", "cut four more holes" |
| 🖼 Image-to-model | Upload a photo/drawing, box-select the target, add size hints — AI vision builds the model |
| ✏️ Annotate & adjust | When words fall short, screenshot the canvas and mark the spots to change with boxes/arrows/pen |
| 🩹 Self-healing errors | One click sends runtime errors back to the AI for a fix |
| 💭 Thinking display | Admin-toggled reasoning display (collapsed blocks, `<think>`-tag models supported) |
| ⏳ Background generation | Runs server-side — close the page and it keeps going; reopen to resume; abort anytime |

### 🛠 Workbench

| Feature | Description |
|---|---|
| 🎚 Parameter panel | Dimension constants auto-extracted into sliders; drag to rebuild instantly |
| 🧭 View controls | Grid/axes toggle, standard views, ortho/perspective, wireframe, hotkeys (G/A/W/O/F/1-4) |
| ⏪ Version snapshots | AI runs auto-saved; manual edits prompt to save; versions tagged AI / manual / loaded |
| 🔧 Code panel | Line numbers, error-line highlight, Ctrl+Enter to run, Tab indent |
| 📸 Canvas screenshot | Export PNG; sharing auto-captures a cover image (re-shoot from any angle) |
| 📂 File support | Open/drop `.stl` (preview), `.js` (load & run), images (image-to-model) |

### 👥 Collaboration & Platform

| Feature | Description |
|---|---|
| 👤 User accounts | Register/login (scrypt hashing + HttpOnly cookies), per-user session history |
| 🛒 Works market | Share creations with covers; browse, 3D-preview, like, and load into your workbench |
| 🔑 Dual API keys | Bring your own key (stored in your account) or use the admin-provisioned shared key |
| 🛡 Admin console | User management, shared model config, generation effort (fast/balanced/fine), content moderation |

## 🚀 Quick Start

> Requires Node.js ≥ 22.5 (uses the built-in `node:sqlite` — no database to install)

```bash
npm install
npm start
```

Open `http://localhost:5173` and register an account.

### Admin Account

On first start an `admin` account is created with the default password `admin123456`
(printed to the console). Set `MAGICCAD_ADMIN_PASSWORD` to choose the initial
password, or change it later via the sidebar.

From the admin console you can:

- Configure **platform-shared LLM API keys** (Anthropic / OpenAI protocol); new users get access by default and can be revoked individually
- Set **generation options**: thinking display on/off, generation effort (fast / balanced / fine)
- Manage users (authorize / delete) and remove any market work

## 🔌 Configuring AI Providers

The Settings panel offers two key sources:

- **Your own API key** — stored in your account (server-side SQLite), never sent back to the browser
- **Platform shared** — the admin-managed key (available to new users by default); the key never leaves the server

### ① Anthropic Claude (default)

- Get an API key from the [Anthropic Console](https://platform.claude.com/)
- Defaults to `claude-opus-4-8`; switch to Sonnet (cheaper) or Haiku (faster)
- Custom base URL supported: leave empty for the official endpoint, or point to any Anthropic-protocol-compatible proxy
- Environment fallbacks: `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`

### ② OpenAI Protocol (compatible APIs)

Any service speaking the OpenAI chat-completions protocol works:

| Service | Base URL example | Model example |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| Local Ollama | `http://localhost:11434/v1` | `qwen2.5-coder:32b` |

Environment fallbacks: `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`.

> Image-to-model requires a vision model: all Anthropic models qualify; on the
> OpenAI-protocol side pick `gpt-4o`, `qwen-vl-max`, or similar.

## 📁 Project Structure

```
server/
  index.js        Express server (auth + sessions + market + admin + background jobs)
  jobs.js         Background generation jobs (reconnect replay, abort)
  db.js           SQLite data layer (users/sessions/works/LLM configs/settings)
  auth.js         Cookie auth middleware
  llm.js          Anthropic SDK calls + modeling system prompt + effort levels
  llm-openai.js   OpenAI-protocol adapter (DeepSeek/Qwen/Ollama, etc.)
src/client/
  main.js         Workbench (chat, streaming, parameter panel, snapshots, annotate, export, share)
  market.js       Works market page (list, likes, 3D preview, load to workbench)
  jscad-runner.js Executes AI-generated modeling code
  viewer.js       Three.js rendering (adaptive grid, dual cameras, wireframe, screenshots)
  export.js       STL / SVG / DXF serialization
public/
  index.html      Workbench        login.html   Login / register
  market.html     Works market     admin.html   Admin console
data/
  magiccad.db     SQLite database (auto-created, gitignored)
```

## 🧱 Tech Stack

| Component | Choice |
|---|---|
| AI access | `@anthropic-ai/sdk` (streaming + adaptive thinking + prompt caching), `openai` (compatible APIs) |
| Database | Node.js built-in `node:sqlite` (zero extra dependencies) |
| Modeling kernel | `@jscad/modeling` (parametric CSG) |
| Rendering | `three` (WebGL) |
| Export | `@jscad/stl-serializer` / `svg-serializer` / `dxf-serializer` |
| Server | `express`; frontend bundled with `esbuild` + `marked`, no framework |

---

<div align="center">

Apache License 2.0 · Copyright © 2026 luchao

</div>
