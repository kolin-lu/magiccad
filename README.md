<div align="center">

# ⚙️ MagicCAD

**用自然语言生成 2D 图形和 3D 模型的 AI 建模平台**

[![Node](https://img.shields.io/badge/Node.js-%E2%89%A5%2022.5-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.2_Beta-d8b04a)]()

**简体中文** | [English](README.en.md)

输入一句「一个带 6 个安装孔的法兰盘」，AI 生成参数化建模代码，<br>
浏览器实时渲染，一键导出 **STL**（3D 打印）/ **SVG / DXF**（激光切割、CAD 图纸）

</div>

---

## 🔍 工作原理

```
自然语言 / 图片 / 标注截图
        │
        ▼
 AI 大模型（Claude / 任意 OpenAI 协议模型）
        │  生成 JSCAD 参数化建模代码
        ▼
 浏览器内执行（@jscad/modeling 构造几何体）
        │
        ├──▶ Three.js 实时 3D/2D 预览（旋转 / 缩放 / 参数滑块）
        └──▶ 导出 STL / SVG / DXF
```

生成的是**代码而非网格**，所以模型是参数化的——既可以在代码面板里改尺寸常量、拖参数滑块，也可以继续用对话让 AI 修改（"孔径改成 10mm"、"再加一圈倒角"）。

## ✨ 功能特性

### 🤖 AI 建模

| 功能 | 说明 |
|---|---|
| 💬 多轮对话建模 | 在已有模型上继续修改："把圆角加大"、"再挖四个孔" |
| 🖼 图片识别建模 | 上传照片/图纸，框选目标区域 + 尺寸说明，AI 视觉识别生成模型 |
| ✏️ 圈注反馈 | 文字说不清的位置，截取画布用方框/箭头/画笔标出要改的部位 |
| 🩹 错误自修复 | 代码执行报错时，一键把错误信息发回给 AI 修复 |
| 💭 思考过程 | 管理员可开关展示模型思考（折叠块，含 `<think>` 标签模型兼容） |
| ⏳ 后台异步生成 | 生成在服务端独立运行，关页不中断，重开自动续接，可一键中止 |

### 🛠 工作台

| 功能 | 说明 |
|---|---|
| 🎚 参数面板 | 自动提取代码中的尺寸常量生成滑块，拖动即时重建 |
| 🧭 视图控制 | 网格/坐标轴显隐、标准视图、透视/正交、线框模式、快捷键（G/A/W/O/F/1-4） |
| ⏪ 版本快照 | AI 生成自动存档、手动修改提示保存，版本区分 AI/手动/载入来源 |
| 🔧 代码面板 | 行号、出错行高亮、Ctrl+Enter 运行、Tab 缩进 |
| 📸 画布截图 | 导出 PNG；分享作品时自动截图作封面（可调整视角重拍） |
| 📂 文件支持 | 打开/拖入 `.stl`（预览）、`.js`（载入运行）、图片（识别建模） |

### 👥 协作与平台

| 功能 | 说明 |
|---|---|
| 👤 用户系统 | 注册/登录（scrypt 哈希 + HttpOnly Cookie），会话历史按用户隔离 |
| 🛒 作品市场 | 一键分享作品（带封面），浏览、3D 预览、点赞、载入工作台继续改 |
| 🔑 双轨 API Key | 用户自配 Key（存自己账户）或管理员授权的平台共享 Key |
| 🛡 管理后台 | 用户管理、共享模型配置、生成精度（快速/均衡/精细）、作品治理 |

## 🚀 快速开始

> 要求：Node.js ≥ 22.5（使用内置 `node:sqlite`，无需安装数据库）

```bash
npm install
npm start
```

打开 `http://localhost:5173`，注册账号即可使用。

### 管理员账户

首次启动自动创建管理员 `admin`，默认密码 `admin123456`（控制台会打印）。
可用环境变量 `MAGICCAD_ADMIN_PASSWORD` 指定初始密码，登录后也可在左下角「改密」修改。

管理员在「管理后台」中可以：

- 配置**平台共享的大模型 API Key**（Anthropic / OpenAI 协议）；新注册用户默认即可使用，可对个别用户取消授权
- 设置**生成选项**：是否显示思考过程、生成精度（快速 / 均衡 / 精细）
- 管理用户（授权 / 删除）、删除任意市场作品

## 🔌 配置 AI 服务商

左下角「设置」中支持两种 Key 来源：

- **我自己的 API Key**：Key 保存在你的账户中（服务端 SQLite），不会回传到浏览器
- **平台共享**：使用管理员统一配置的 Key（新用户默认可用），Key 不离开服务端

### ① Anthropic Claude（默认）

- 在 [Anthropic Console](https://platform.claude.com/) 获取 API Key
- 默认 `claude-opus-4-8`，可切换 Sonnet（更便宜）或 Haiku（更快）
- 支持自定义 Base URL：留空走官方接口，可填任何兼容 Anthropic 协议的代理/中转地址
- 环境变量回落：`ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`

### ② OpenAI 协议（兼容接口）

任何兼容 OpenAI chat completions 协议的服务都可接入：

| 服务 | Base URL 示例 | 模型示例 |
|---|---|---|
| OpenAI 官方 | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| 本地 Ollama | `http://localhost:11434/v1` | `qwen2.5-coder:32b` |

环境变量回落：`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`。

> 图片识别建模需要视觉模型：Anthropic 全系支持；OpenAI 协议侧请选 `gpt-4o`、`qwen-vl-max` 等。

## 📁 项目结构

```
server/
  index.js        Express 服务器（认证 + 会话 + 市场 + 管理 + 后台生成任务）
  jobs.js         后台生成任务管理（断线续接、中止）
  db.js           SQLite 数据层（用户/登录态/会话/作品/模型配置/全局设置）
  auth.js         Cookie 登录态中间件
  llm.js          Anthropic SDK 调用 + 建模系统提示词 + 生成精度
  llm-openai.js   OpenAI 协议适配（兼容 DeepSeek/通义/Ollama 等）
src/client/
  main.js         工作台（聊天、流式解析、参数面板、版本快照、圈注、导出、分享）
  market.js       作品市场页（列表、点赞、3D 预览、载入工作台）
  jscad-runner.js 执行 AI 生成的建模代码
  viewer.js       Three.js 渲染（自适应网格、双相机、线框、截图）
  export.js       STL / SVG / DXF 序列化导出
public/
  index.html      工作台          login.html   登录/注册
  market.html     作品市场        admin.html   管理后台
data/
  magiccad.db     SQLite 数据库（自动创建，已 gitignore）
```

## 🧱 技术栈

| 组件 | 选型 |
|---|---|
| AI 接入 | `@anthropic-ai/sdk`（流式 + 自适应思考 + 提示词缓存）、`openai`（兼容接口） |
| 数据库 | Node.js 内置 `node:sqlite`（零额外依赖） |
| 建模内核 | `@jscad/modeling`（参数化 CSG 建模） |
| 渲染 | `three`（WebGL） |
| 导出 | `@jscad/stl-serializer` / `svg-serializer` / `dxf-serializer` |
| 服务 | `express`，前端 `esbuild` 打包 + `marked` 渲染，无框架 |

---

<div align="center">

MIT License

</div>
