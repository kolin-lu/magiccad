# MagicCAD

通过接入 AI 大模型，用**自然语言**生成 **2D 图形和 3D 模型**的本地应用。

输入一句话（例如「一个带 6 个安装孔的法兰盘」），AI 会生成参数化建模代码，在浏览器中实时渲染，并可一键导出：

- **3D 模型 → STL**（可直接 3D 打印）
- **2D 图形 → SVG / DXF**（可用于激光切割、CAD 图纸）

## 工作原理

```
自然语言描述
   │
   ▼
Claude API（生成 JSCAD 参数化建模代码）
   │
   ▼
浏览器内执行代码（@jscad/modeling 构造几何体）
   │
   ├──▶ Three.js 实时 3D/2D 预览（可旋转/缩放）
   └──▶ 导出 STL / SVG / DXF
```

生成的是**代码而非网格**，所以模型是参数化的——可以在内置代码面板里直接改尺寸常量再点「运行」，也可以继续用对话让 AI 修改（"孔径改成 10mm"、"再加一圈倒角"）。

## 快速开始

要求：Node.js ≥ 18

```bash
npm install
npm start
```

打开浏览器访问 `http://localhost:5173`。

### 配置 AI 服务商

左下角「设置」中可选两类服务商，配置只保存在本机浏览器 localStorage，仅发送给本地服务：

**① Anthropic Claude（默认）**

- 在 [Anthropic Console](https://platform.claude.com/) 获取 API Key
- 默认 `claude-opus-4-8`，可切换为 Sonnet（更便宜）或 Haiku（更快）
- 环境变量方式：`export ANTHROPIC_API_KEY=sk-ant-...`

**② OpenAI 协议（兼容接口）**

任何兼容 OpenAI chat completions 协议的服务都可以接入，配置 Base URL + 模型名 + API Key 即可：

| 服务 | Base URL 示例 | 模型示例 |
|---|---|---|
| OpenAI 官方 | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| 本地 Ollama | `http://localhost:11434/v1` | `qwen2.5-coder:32b` |

环境变量方式：`OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`。

## 功能

- 💬 **多轮对话建模**：在已有模型上继续修改（"把圆角加大"、"再挖四个孔"）
- 🔧 **代码可见可改**：底部代码面板展示 AI 生成的 JSCAD 代码，改完点「运行」即时生效
- 🩹 **错误自修复**：代码执行报错时，一键把错误信息发回给 AI 修复
- 📦 **2D/3D 自动识别**：根据几何体类型自动启用对应的导出按钮
- 🎨 **实时预览**：Three.js 渲染，支持旋转、缩放、平移，CAD 习惯 Z 轴朝上

## 项目结构

```
server/
  index.js        Express 本地服务器（静态资源 + /api/generate 流式接口）
  llm.js          Anthropic SDK 调用 + 建模系统提示词
  llm-openai.js   OpenAI 协议适配（兼容 DeepSeek/通义/Ollama 等）
src/client/
  main.js         界面逻辑（聊天、流式解析、导出）
  jscad-runner.js 执行 AI 生成的建模代码
  viewer.js       Three.js 渲染（geom3 网格 / geom2 填充+轮廓 / path2 折线）
  export.js       STL / SVG / DXF 序列化导出
public/
  index.html, style.css
```

## 技术栈

| 组件 | 选型 |
|---|---|
| AI 接入 | `@anthropic-ai/sdk`（流式 + 自适应思考 + 提示词缓存）、`openai`（兼容接口） |
| 建模内核 | `@jscad/modeling`（参数化 CSG 建模） |
| 渲染 | `three`（WebGL） |
| 导出 | `@jscad/stl-serializer` / `svg-serializer` / `dxf-serializer` |
| 服务 | `express`，前端用 `esbuild` 打包，无框架 |
