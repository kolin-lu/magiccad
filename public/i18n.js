// 轻量中英切换：中文为源语言，本字典提供中→英映射。
// 静态文本在页面加载时遍历替换；JS 动态字符串经 window.t() 包装。
// 切换语言写入 localStorage 后刷新页面生效。
(() => {
  const en = {
    // ---------- 通用 ----------
    "v0.2 测试版": "v0.2 Beta",
    "关闭": "Close",
    "取消": "Cancel",
    "保存": "Save",
    "删除": "Delete",
    "载入": "Load",
    "加载中…": "Loading…",
    "加载失败": "Failed to load",
    "请求失败（{0}）": "Request failed ({0})",
    "请先登录": "Please sign in first",

    // ---------- 工作台标题/侧栏 ----------
    "MagicCAD — 自然语言生成 2D/3D 模型": "MagicCAD — Natural Language 2D/3D Modeling",
    "市场": "Market",
    "历史": "History",
    "新会话": "New Chat",
    "作品市场": "Works Market",
    "查看历史会话": "View chat history",
    "法兰盘": "Flange",
    "齿轮": "Gear",
    "六角螺母": "Hex Nut",
    "2D 五角星": "2D Star",
    "收纳盒": "Storage Box",
    "一个法兰盘：外径 80mm，厚 10mm，中心孔直径 30mm，周围均布 6 个直径 8mm 的安装孔":
      "A flange: 80mm outer diameter, 10mm thick, 30mm center hole, 6 evenly spaced 8mm mounting holes",
    "一个 20 齿的直齿轮，模数 2，厚度 8mm，中心带 10mm 的轴孔和键槽":
      "A 20-tooth spur gear, module 2, 8mm thick, with a 10mm shaft hole and keyway",
    "M10 六角螺母，按标准尺寸建模": "An M10 hex nut, modeled to standard dimensions",
    "2D 图形：一个五角星 logo，外接圆直径 60mm，中间镂空一个圆":
      "2D shape: a five-pointed star logo, 60mm circumscribed circle, with a hollow circle in the middle",
    "一个带提手的小收纳盒，100×60×40mm，壁厚 2.5mm，圆角":
      "A small storage box with a handle, 100×60×40mm, 2.5mm walls, rounded corners",
    "描述你想要的模型，例如：一个直径 50mm 的圆形杯垫，刻上波浪纹…（Enter 发送，Shift+Enter 换行）":
      "Describe the model you want, e.g. a 50mm round coaster with a wave pattern… (Enter to send, Shift+Enter for newline)",
    "发送": "Send",
    "■ 中止": "■ Stop",

    // ---------- 设置 ----------
    "⚙ 设置（服务商 / 模型 / API Key）": "⚙ Settings (Provider / Model / API Key)",
    "API Key 来源": "API Key Source",
    "我自己的 API Key": "My own API key",
    "平台共享（管理员统一配置）": "Platform shared (admin-managed)",
    "AI 服务商": "AI Provider",
    "OpenAI 协议（兼容接口）": "OpenAI protocol (compatible APIs)",
    "AI 模型": "Model",
    "Base URL（可选，兼容 Anthropic 协议的代理/中转）": "Base URL (optional, Anthropic-compatible proxy)",
    "留空走官方 https://api.anthropic.com": "Leave empty for official https://api.anthropic.com",
    "模型名称": "Model name",
    "兼容 OpenAI / DeepSeek / 通义千问 / Moonshot / 本地 Ollama、vLLM 等任何 OpenAI 协议服务，Base URL 一般以 /v1 结尾":
      "Works with OpenAI / DeepSeek / Qwen / Moonshot / local Ollama, vLLM and any OpenAI-protocol service; base URL usually ends with /v1",
    "Key 加密保存在你的账户中，仅用于服务端调用": "Your key is stored in your account and used server-side only",
    "已保存（输入新 Key 可覆盖）": "Saved (enter a new key to replace)",
    "⚠ 你的共享模型使用权已被管理员关闭，请使用自己的 API Key 或联系管理员。":
      "⚠ Your shared-model access has been disabled by the admin. Use your own API key or contact the admin.",
    "⚠ 管理员尚未启用该服务商的共享配置，请换一个服务商。":
      "⚠ The admin hasn't enabled the shared config for this provider. Try another provider.",
    "✓ 已授权使用平台共享模型，模型与 Key 由管理员统一配置。":
      "✓ Authorized to use the platform-shared model; model and key are managed by the admin.",
    "API Key 已保存到账户": "API key saved to your account",
    "设置保存失败": "Failed to save settings",

    // ---------- 用户栏 ----------
    "管理后台": "Admin",
    "改密": "Password",
    "修改密码": "Change password",
    "退出": "Sign out",
    "请输入当前密码：": "Enter current password:",
    "请输入新密码（至少 6 位）：": "Enter new password (min 6 characters):",
    "密码已修改": "Password changed",
    "修改失败": "Change failed",

    // ---------- 工具栏 / 画布 ----------
    "就绪": "Ready",
    "打开文件": "Open File",
    "打开 STL 模型、JSCAD 代码或图片（框选后 AI 识别建模），也可直接拖入画布":
      "Open an STL, JSCAD code or image (box-select for AI modeling); you can also drop files onto the canvas",
    "截图": "Screenshot",
    "把当前画面保存为 PNG 图片": "Save the current view as a PNG",
    "圈注反馈": "Annotate",
    "截取当前画布，圈注出要调整的部位发给 AI": "Screenshot the canvas and mark the spots to adjust for the AI",
    "分享到市场": "Share",
    "把当前模型发布到作品市场": "Publish the current model to the works market",
    "导出 STL（3D 打印）": "Export STL (3D print)",
    "导出 SVG": "Export SVG",
    "导出 DXF": "Export DXF",
    "网格": "Grid",
    "轴": "Axes",
    "线框": "Wire",
    "透视": "Persp",
    "正交": "Ortho",
    "等轴": "Iso",
    "顶": "Top",
    "前": "Front",
    "右": "Right",
    "显示/隐藏网格（G）": "Show/hide grid (G)",
    "显示/隐藏坐标轴（A）": "Show/hide axes (A)",
    "线框/着色模式（W）": "Wireframe/shaded (W)",
    "透视/正交投影切换（O）": "Perspective/orthographic (O)",
    "等轴测视图（1）": "Isometric view (1)",
    "顶视图（2）": "Top view (2)",
    "前视图（3）": "Front view (3)",
    "右视图（4）": "Right view (4)",
    "适应视图（F）": "Fit view (F)",
    "参数调节": "Parameters",
    "收起/展开": "Collapse/expand",
    "松开以打开 .stl / .js / 图片文件": "Drop to open .stl / .js / image files",
    "拖动调整视角（可用左上角工具栏切视图），满意后点「完成截图」":
      "Adjust the view (HUD shortcuts work too), then click \"Capture\"",
    "✓ 完成截图": "✓ Capture",
    "网格 {0} mm": "Grid {0} mm",
    "已保存截图": "Screenshot saved",
    "已导出": "Exported",

    // ---------- 代码面板 ----------
    "代码 ▴": "Code ▴",
    "代码 ▾": "Code ▾",
    "可手动修改参数后重新运行": "Edit parameters and re-run",
    "▶ 运行": "▶ Run",
    "运行（Ctrl+Enter）": "Run (Ctrl+Enter)",
    "AI 生成的 JSCAD 建模代码会显示在这里": "AI-generated JSCAD modeling code appears here",
    "版本快照（AI 生成 / 手动修改），选择可回退": "Version snapshots (AI / manual); select to roll back",
    "代码已手动修改": "Code edited manually",
    "保存版本": "Save version",
    "忽略": "Dismiss",
    "手动": "manual",
    "已回退到 V{0}": "Rolled back to V{0}",
    "已保存手动修改为版本快照": "Manual edit saved as a version snapshot",
    "代码执行出错": "Code execution error",
    "代码执行出错（第 {0} 行）": "Code execution error (line {0})",
    "已生成 {0} 个几何体（{1}）· {2}": "Generated {0} geometries ({1}) · {2}",

    // ---------- 聊天 ----------
    "你好，{0}！用一句话描述你想要的 2D 图形或 3D 模型，我会生成可预览、可导出的参数化模型。做出满意的作品后，可以「分享到市场」给大家。":
      "Hi {0}! Describe the 2D shape or 3D model you want and I'll generate a parametric model you can preview and export. Share your best work to the market!",
    "已开启新会话。描述你想要的模型吧！": "New chat started. Describe the model you want!",
    "〔已生成建模代码 →〕": "[Modeling code generated →]",
    "💭 思考过程": "💭 Thinking",
    "💭 思考中…": "💭 Thinking…",
    "让 AI 修复": "Ask AI to fix",
    "模型代码执行出错：{0}": "Model code failed: {0}",
    "执行报错：{0}\n请修复并输出完整代码。": "Execution error: {0}\nPlease fix it and output the complete code.",
    "代码执行出错：{0}": "Code execution error: {0}",
    "正在请求 AI…": "Calling the AI…",
    "AI 正在思考…": "AI is thinking…",
    "AI 正在生成模型代码…": "AI is writing modeling code…",
    "生成失败": "Generation failed",
    "回复中没有建模代码": "No modeling code in the reply",
    "模型没有返回内容，请重试。": "The model returned nothing. Please retry.",
    "该请求被模型安全策略拒绝，请换一种描述方式。": "Request declined by the model's safety policy. Try rephrasing.",
    "已中止生成": "Generation aborted",
    "已中止，保留了已生成的部分": "Aborted; partial output kept",
    "正在续接后台生成…": "Resuming background generation…",
    "连接生成任务失败（{0}）": "Failed to attach to the job ({0})",
    "上传的图片": "Uploaded image",

    // ---------- 历史 ----------
    "历史会话": "Chat History",
    "还没有历史会话": "No chats yet",
    "未命名会话": "Untitled chat",
    "图片建模会话": "Image modeling chat",
    "{0} 条消息": "{0} messages",
    " · 含模型代码": " · with code",
    "删除会话「{0}」？": "Delete chat \"{0}\"?",
    "会话不存在": "Chat not found",
    "已载入会话": "Chat loaded",
    "载入失败：{0}": "Load failed: {0}",

    // ---------- 文件 ----------
    "已打开 {0}（查看模式，导出不可用）": "Opened {0} (view only, export unavailable)",
    "不支持的文件类型，请选择 .stl / .js / 图片文件": "Unsupported file type; choose .stl / .js / image files",
    "打开文件失败：{0}": "Failed to open file: {0}",
    "已载入市场作品「{0}」，可以直接修改代码，或继续用对话改进它。":
      "Loaded \"{0}\" from the market. Edit the code directly or keep improving it via chat.",

    // ---------- 框选 / 圈注 ----------
    "框选要识别的区域": "Box-select the Region to Recognize",
    "全选": "Select all",
    "对选中区域画标注后发给 AI 调整": "Annotate the selected region and send to the AI",
    "拖动画出选框，拖动选框可移动，拖动四角可调整大小": "Drag to draw a box; drag to move, corners to resize",
    "补充说明（强烈建议填写）": "Notes (strongly recommended)",
    "这是什么物体？关键尺寸？要 2D 还是 3D？例如：法兰盘照片，外径 80mm，要 3D 模型":
      "What is it? Key dimensions? 2D or 3D? e.g. photo of a flange, 80mm OD, want a 3D model",
    "AI 只能从图片推断形状比例，绝对尺寸请在说明中给出，生成后也可用参数面板微调。":
      "The AI infers proportions only; give absolute sizes in the notes. Fine-tune with the parameter panel afterwards.",
    "识别并建模": "Recognize & Model",
    "正在生成中，请稍候再试": "Generating; please wait",
    "请先框选一个有效区域": "Select a valid region first",
    "图片加载失败": "Failed to load image",
    "请根据这张图片建模。补充说明：{0}": "Model this image. Notes: {0}",
    "请识别这张图片中的物体，生成对应的参数化模型（尺寸未知时自行估一个合理值并说明）。":
      "Recognize the object in this image and generate a parametric model (estimate reasonable sizes if unknown and explain).",
    "圈注反馈 — 在图上标出要调整的地方": "Annotate — Mark What to Adjust",
    "▢ 框选": "▢ Box",
    "↗ 箭头": "↗ Arrow",
    "✎ 画笔": "✎ Pen",
    "拖出方框圈选部位": "Drag a box around the spot",
    "拖出箭头指向部位": "Drag an arrow pointing at the spot",
    "自由圈画": "Free-hand drawing",
    "红色": "Red",
    "黄色": "Yellow",
    "蓝色": "Blue",
    "撤销": "Undo",
    "清空": "Clear",
    "说明（建议配合标注简述要改什么）": "Notes (briefly say what to change)",
    "例如：红圈处壁太薄，改成 3mm；箭头指的孔往外移 5mm":
      "e.g. wall in the red circle is too thin, make it 3mm; move the arrowed hole 5mm outward",
    "发送给 AI 调整": "Send to AI",
    "请至少画一个标注，或填写文字说明": "Draw at least one annotation or add a note",
    "截图加载失败": "Failed to load screenshot",
    "这是当前模型的标注截图，标注指出需要调整的部位。要求：{0}":
      "This is an annotated screenshot of the current model; the marks show what to adjust. Requirements: {0}",
    "这是当前模型的标注截图，请根据标注（框/箭头/圈画）指出的部位调整模型，输出完整新代码。":
      "This is an annotated screenshot of the current model. Adjust the parts marked (boxes/arrows/strokes) and output the complete new code.",

    // ---------- 分享 ----------
    "分享到作品市场": "Share to Works Market",
    "作品标题": "Title",
    "给作品起个名字": "Name your work",
    "简介（可选）": "Description (optional)",
    "一句话介绍：用途、尺寸、打印建议…": "One-liner: purpose, dimensions, print tips…",
    "封面（当前画布截图）": "Cover (canvas screenshot)",
    "调整视角重拍": "Re-shoot",
    "回到画布调整视角后重新截图": "Adjust the view on canvas and capture again",
    "将发布当前代码面板中的建模代码，所有用户可见、可载入。":
      "Publishes the code currently in the code panel; visible and loadable by all users.",
    "发布": "Publish",
    "发布失败（{0}）": "Publish failed ({0})",
    "已发布到作品市场": "Published to the works market",
    "作品封面预览": "Cover preview",

    // ---------- 登录页 ----------
    "登录 — MagicCAD": "Sign in — MagicCAD",
    "自然语言生成 2D/3D 模型": "Natural language 2D/3D modeling",
    "登录": "Sign in",
    "注册": "Register",
    "用户名": "Username",
    "密码": "Password",
    "确认密码": "Confirm password",
    "3-20 位字母、数字、下划线": "3-20 letters, digits or underscores",
    "至少 6 位": "At least 6 characters",
    "两次输入的密码不一致": "Passwords do not match",

    // ---------- 市场页 ----------
    "作品市场 — MagicCAD": "Works Market — MagicCAD",
    "· 作品市场": "· Works Market",
    "← 返回工作台": "← Back to Workbench",
    "还没有作品。在工作台生成模型后，点「分享到市场」发布第一个作品吧！":
      "No works yet. Generate a model in the workbench and click \"Share\" to publish the first one!",
    "加载失败，请刷新重试": "Failed to load; please refresh",
    "（没有简介）": "(no description)",
    "（我）": " (me)",
    "查看": "View",
    "作者：{0} · {1}": "By {0} · {1}",
    "♥ 已赞": "♥ Liked",
    "♡ 点赞": "♡ Like",
    "载入到工作台": "Load to Workbench",
    "删除作品": "Delete Work",
    "查看建模代码": "View modeling code",
    "删除作品「{0}」？": "Delete work \"{0}\"?",
    "删除失败": "Delete failed",
    "作品不存在": "Work not found",
    "\n（预览失败：{0}）": "\n(Preview failed: {0})",

    // ---------- 管理后台 ----------
    "管理后台 — MagicCAD": "Admin — MagicCAD",
    "· 管理后台": "· Admin Console",
    "平台共享模型配置": "Shared Model Configuration",
    "在这里配置平台统一的大模型 API Key。用户在工作台设置中选择「平台共享」即可使用（新注册用户默认已授权，可在下方用户管理中逐个取消），Key 不会下发到浏览器。":
      "Configure platform-wide LLM API keys here. Users pick \"Platform shared\" in Settings to use them (new users are authorized by default; revoke individually below). Keys never reach the browser.",
    "启用": "Enable",
    "Base URL（可选）": "Base URL (optional)",
    "默认官方 https://api.anthropic.com": "Defaults to official https://api.anthropic.com",
    "模型": "Model",
    "Base URL 留空走官方接口；可填任何兼容 Anthropic 协议的代理/中转地址":
      "Leave empty for the official endpoint, or any Anthropic-protocol-compatible proxy",
    "已保存（留空表示不修改）": "Saved (leave empty to keep)",
    "✓ 已保存": "✓ Saved",
    "生成选项": "Generation Options",
    "显示思考过程": "Show thinking",
    "勾选后，支持思考的模型（Claude 自适应思考、DeepSeek-R1 等推理模型）会把思考过程实时展示给用户（折叠在回答上方，不进入对话上下文）；不勾选则只输出最终结果。对自配 Key 和共享 Key 的用户都生效。":
      "When enabled, thinking-capable models (Claude adaptive thinking, DeepSeek-R1, etc.) stream their reasoning to users (collapsed above the answer, not added to context). Applies to both own-key and shared-key users.",
    "生成精度：": "Generation effort:",
    "快速": "Fast",
    "均衡（默认）": "Balanced (default)",
    "精细": "Fine",
    "快速：思考简短、模型从简（省略倒角等细节），出结果快、省 token；均衡：模型自行决定思考深度；精细：充分思考、细节丰富（倒角/圆角/高分段数），耗时与费用更高。 Claude 模型同时调整思考与精力参数；OpenAI 协议模型（含 DeepSeek-R1 等推理模型）通过提示词约束。对所有用户生效。":
      "Fast: brief thinking, simpler models (no chamfers etc.), quick and cheap. Balanced: the model decides. Fine: thorough thinking, rich detail (fillets/high segment counts), slower and pricier. Claude models tune thinking & effort parameters; OpenAI-protocol models (incl. DeepSeek-R1) are steered via prompts. Applies to all users.",
    "用户管理": "User Management",
    "角色": "Role",
    "作品数": "Works",
    "注册时间": "Registered",
    "共享模型授权": "Shared Access",
    "操作": "Actions",
    "管理员": "Admin",
    "用户": "User",
    "删除用户「{0}」？其会话历史与作品将一并删除。": "Delete user \"{0}\"? Their chats and works will also be deleted.",
  };

  let lang = localStorage.getItem("magiccad.lang") || "zh";
  if (lang !== "en" && lang !== "zh") lang = "zh";

  function t(s, ...args) {
    let out = lang === "en" && en[s] !== undefined ? en[s] : s;
    args.forEach((a, i) => {
      out = out.replaceAll(`{${i}}`, a);
    });
    return out;
  }

  function applyStatic() {
    const toggle = document.getElementById("lang-toggle");
    if (toggle) {
      toggle.textContent = lang === "en" ? "中文" : "EN";
      toggle.title = lang === "en" ? "切换为中文" : "Switch to English";
      toggle.addEventListener("click", () => window.I18N.toggle());
    }
    if (lang !== "en") return;
    document.documentElement.lang = "en";
    if (en[document.title]) document.title = en[document.title];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement && ["SCRIPT", "STYLE"].includes(node.parentElement.tagName)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    let node;
    while ((node = walker.nextNode())) {
      const trimmed = node.nodeValue.trim();
      if (trimmed && en[trimmed] !== undefined) {
        node.nodeValue = node.nodeValue.replace(trimmed, en[trimmed]);
      }
    }
    for (const attr of ["placeholder", "title"]) {
      for (const elx of document.querySelectorAll(`[${attr}]`)) {
        const v = elx.getAttribute(attr);
        if (en[v] !== undefined) elx.setAttribute(attr, en[v]);
      }
    }
    for (const elx of document.querySelectorAll("[data-prompt]")) {
      if (en[elx.dataset.prompt] !== undefined) elx.dataset.prompt = en[elx.dataset.prompt];
    }
  }

  window.I18N = {
    get lang() {
      return lang;
    },
    t,
    toggle() {
      localStorage.setItem("magiccad.lang", lang === "en" ? "zh" : "en");
      location.reload();
    },
  };
  window.t = t;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyStatic);
  } else {
    applyStatic();
  }
})();
