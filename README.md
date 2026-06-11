# MagicCAD

通过接入 AI 大模型，用**自然语言**生成 **2D 图形和 3D 模型**的多用户 Web 应用。

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

要求：Node.js ≥ 22.5（使用内置 `node:sqlite`，无需安装数据库）

```bash
npm install
npm start
```

打开浏览器访问 `http://localhost:5173`，注册账号即可使用。

### 管理员账户

首次启动会自动创建管理员 `admin`，默认密码 `admin123456`（控制台会打印）。
可用环境变量 `MAGICCAD_ADMIN_PASSWORD` 指定初始密码，登录后也可在左下角「改密」修改。

管理员在「管理后台」中可以：

- 配置**平台共享的大模型 API Key**（Anthropic / OpenAI 协议）；新注册用户默认即可使用，可对个别用户取消授权
- 「生成选项」中可开关**是否显示思考过程**：开启后支持思考的模型（Claude 自适应思考、DeepSeek-R1 等）会把思考实时展示在回答上方的折叠块中
- 管理用户（授权 / 删除）、删除任意市场作品

### 配置 AI 服务商

左下角「设置」中支持两种 Key 来源：

- **我自己的 API Key**：Key 保存在你的账户中（SQLite，服务端），不会回传到浏览器
- **平台共享**：使用管理员统一配置的 Key（新用户默认可用，管理员可取消），Key 不离开服务端

两类服务商：

**① Anthropic Claude（默认）**

- 在 [Anthropic Console](https://platform.claude.com/) 获取 API Key
- 默认 `claude-opus-4-8`，可切换为 Sonnet（更便宜）或 Haiku（更快）
- 环境变量方式：`export ANTHROPIC_API_KEY=sk-ant-...`（作为所有用户的回落 Key）

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

- 👤 **用户系统**：注册 / 登录（SQLite + scrypt 密码哈希 + HttpOnly Cookie 会话），会话历史按用户隔离
- 🛒 **作品市场**：把建模成果一键「分享到市场」，所有用户可浏览、3D 预览、点赞，并「载入到工作台」继续修改
- 🔑 **双轨 API Key**：用户自配 Key（存在自己账户下）或使用管理员授权的平台共享 Key
- 🛠 **管理后台**：用户管理、共享模型配置、作品治理
- 🧭 **画布视图控制**：网格/坐标轴显隐（自适应格距）、等轴/顶/前/右标准视图、透视/正交切换（2D 自动顶视+正交）、线框模式、适应视图、模型包围盒尺寸显示，支持快捷键（G/A/W/O/F/1-4）
- 🎚 **参数面板**：自动提取代码中的尺寸常量生成滑块，拖动即时重建模型，不写代码也能调参数
- ⏪ **版本快照**：每次生成/运行自动存档，下拉即可回退任意版本
- 📸 **画布截图**：一键导出 PNG；分享作品时自动截图作为市场封面
- 🖼 **图片识别建模**：上传照片/图纸（打开或拖入画布），框选目标区域并补充尺寸说明，AI 视觉识别后生成参数化模型；识别不准的尺寸可用参数面板校正。Anthropic 全系模型支持，OpenAI 协议需选视觉模型（gpt-4o、qwen-vl-max 等）；适合规则零件与平面轮廓，不适合复杂有机形状
- 💬 **多轮对话建模**：在已有模型上继续修改（"把圆角加大"、"再挖四个孔"）
- 🕘 **历史记录**：会话自动保存到数据库，随时打开「历史」载入继续编辑或删除
- 📂 **打开文件**：打开 `.stl` 模型直接预览（查看模式），打开 `.js` 建模代码载入并运行
- 🔧 **代码可见可改**：底部代码面板带行号与出错行高亮，Ctrl+Enter 运行、Tab 缩进，改完即时生效；支持把 .stl/.js 文件直接拖入画布打开
- 🩹 **错误自修复**：代码执行报错时，一键把错误信息发回给 AI 修复
- 📦 **2D/3D 自动识别**：根据几何体类型自动启用对应的导出按钮
- 🎨 **实时预览**：Three.js 渲染，支持旋转、缩放、平移，CAD 习惯 Z 轴朝上

## 项目结构

```
server/
  index.js        Express 服务器（认证 + 会话 + 作品市场 + 管理 + /api/generate 流式接口）
  db.js           SQLite 数据层（node:sqlite：用户/登录态/会话/作品/模型配置）
  auth.js         Cookie 登录态中间件
  llm.js          Anthropic SDK 调用 + 建模系统提示词
  llm-openai.js   OpenAI 协议适配（兼容 DeepSeek/通义/Ollama 等）
src/client/
  main.js         工作台界面逻辑（聊天、流式解析、导出、分享）
  market.js       作品市场页（列表、点赞、3D 预览、载入工作台）
  jscad-runner.js 执行 AI 生成的建模代码
  viewer.js       Three.js 渲染（geom3 网格 / geom2 填充+轮廓 / path2 折线）
  export.js       STL / SVG / DXF 序列化导出
public/
  index.html      工作台
  login.html      登录 / 注册
  market.html     作品市场
  admin.html      管理后台
  style.css
data/
  magiccad.db     SQLite 数据库（自动创建，已 gitignore）
```

## 技术栈

| 组件 | 选型 |
|---|---|
| AI 接入 | `@anthropic-ai/sdk`（流式 + 自适应思考 + 提示词缓存）、`openai`（兼容接口） |
| 数据库 | Node.js 内置 `node:sqlite`（零额外依赖） |
| 建模内核 | `@jscad/modeling`（参数化 CSG 建模） |
| 渲染 | `three`（WebGL） |
| 导出 | `@jscad/stl-serializer` / `svg-serializer` / `dxf-serializer` |
| 服务 | `express`，前端用 `esbuild` 打包，无框架 |
