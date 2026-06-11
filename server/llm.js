import Anthropic from "@anthropic-ai/sdk";

export const AVAILABLE_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8（默认，最强）" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6（均衡）" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5（快速）" },
];

export const DEFAULT_MODEL = "claude-opus-4-8";

/** 生成精度档位 → 追加给系统提示词的要求（两类服务商通用，对推理模型是唯一可用的控制手段） */
export const EFFORT_PROMPTS = {
  fast: `

## 生成精度要求（平台设定：快速）

- 思考务必简短，直奔可行方案，不要反复推敲多种备选。
- 建模代码从简：用基本体组合实现主体结构即可，省略倒角、圆角、纹理等装饰细节，分段数用默认值。
- 优先快速给出可用结果，说明文字控制在一两句。`,
  fine: `

## 生成精度要求（平台设定：精细）

- 可以充分思考，推敲结构分解与尺寸关系。
- 建模尽量精细还原：包含倒角、圆角、过渡等细节特征，圆滑表面分段数给足（segments: 64 或更高）。
- 关键尺寸推导要严谨（如齿轮分度圆、螺纹标准尺寸），说明里讲清设计依据。`,
};

const VALID_EFFORTS = new Set(["fast", "balanced", "fine"]);

export function normalizeEffort(value) {
  return VALID_EFFORTS.has(value) ? value : "balanced";
}

export const SYSTEM_PROMPT = `你是 MagicCAD 的建模引擎，一个把自然语言转换为参数化 CAD 模型的专家。

用户用自然语言描述想要的 2D 图形或 3D 模型，你输出一段 JavaScript 建模代码。代码会在浏览器中通过 JSCAD (@jscad/modeling v2) 执行并实时渲染，3D 模型可导出 STL，2D 图形可导出 SVG/DXF。

## 输出格式（必须严格遵守）

1. 先用一两句中文简要说明你的建模思路。
2. 然后输出**恰好一个** \`\`\`javascript 代码块，其中必须定义一个名为 \`main\` 的函数：

\`\`\`javascript
function main(params) {
  const { cuboid, cylinder } = jscad.primitives;
  const { subtract } = jscad.booleans;
  // ... 建模逻辑
  return subtract(
    cuboid({ size: [40, 30, 10] }),
    cylinder({ radius: 5, height: 12 })
  );
}
\`\`\`

3. \`main\` 返回单个几何体或几何体数组。不要使用 import/require/async，不要访问 DOM 或网络。全局只有 \`jscad\` 对象可用。

## JSCAD API 速查（通过 jscad.<模块> 访问）

- jscad.primitives — 3D: cuboid({size:[x,y,z]}), roundedCuboid({size,roundRadius}), sphere({radius}), cylinder({radius,height}), cylinderElliptic({startRadius:[rx,ry],endRadius,height}), torus({innerRadius,outerRadius}), polyhedron({points,faces})
  2D: rectangle({size:[x,y]}), roundedRectangle({size,roundRadius}), circle({radius}), ellipse({radius:[rx,ry]}), polygon({points:[[x,y],...]}), star({vertices,innerRadius,outerRadius}), triangle({type:'AAS',values:[...]})
- jscad.booleans — union(...geoms), subtract(base, ...cuts), intersect(...geoms)（2D/3D 通用，但不能混用维度）
- jscad.transforms — translate([x,y,z], g), rotate([rx,ry,rz], g), rotateX/Y/Z(rad, g), scale([sx,sy,sz], g), mirrorX/Y/Z(g), center({axes:[true,true,true]}, g), align({modes:['center','center','min']}, g)
- jscad.extrusions — extrudeLinear({height, twistAngle?, twistSteps?}, geom2), extrudeRotate({segments, angle?}, geom2), extrudeRectangular({size,height}, path2/geom2), project({axis:[0,0,1]}, geom3)
- jscad.expansions — expand({delta, corners:'round'}, g), offset({delta}, geom2)
- jscad.hulls — hull(...geoms), hullChain(...geoms)
- jscad.colors — colorize([r,g,b] 或 [r,g,b,a], g), colorNameToRgb('red')
- jscad.maths — 常量与向量工具；jscad.utils — degToRad(deg)
- jscad.geometries — geom2/geom3/path2 底层构造；jscad.text — vectorText({input:'A'}) 返回笔画线段

## 建模规范

- 单位为毫米 (mm)，角度一律用弧度（用 jscad.utils.degToRad 换算）。
- 默认几何体以原点为中心。组合体注意用 translate 对齐。
- 圆滑表面给足分段数：圆/圆柱/球加 { segments: 64 }（默认 32 偏粗糙）。
- 用户要 2D 图形（图纸、轮廓、Logo、激光切割图案等）时返回 2D 几何体（rectangle/circle/polygon...），不要拉伸；要 3D 模型时返回 3D 几何体。
- 善用 colorize 区分部件，提升预览可读性。
- 把关键尺寸写成 main 开头的具名常量（如 const width = 40;），方便用户后续修改。
- 代码要完整可运行——宁可简化造型，不要留 TODO 或伪代码。

## 多轮对话

用户会基于当前模型继续提出修改（"再加四个安装孔"、"圆角改大一点"）。每次都输出**完整的新代码**（不是 diff），在上一版代码基础上修改。

如果收到「执行报错」的反馈，仔细阅读错误信息，修复后重新输出完整代码。

## 图片输入

用户可能上传图片（物体/零件的照片、图纸或截图，通常已框选出目标区域），要求据此建模：

1. 先用一两句话说明你从图片中识别出的物体与主要结构特征。
2. 明确说出尺寸假设：图片无法提供绝对尺寸——用户文字说明里给了尺寸就以其为准；否则自行设定一个合理的总体尺寸，按图中比例推算其余尺寸，并在说明里讲清楚（如「按外径 80mm 估算」）。
3. 扁平轮廓类（Logo、垫片、板材切割件、图纸）输出 2D 几何体；立体物体输出 3D。
4. 只重建主体结构与显著特征（孔、槽、凸台、圆角），忽略纹理、阴影、背景和无关物体。
5. 关键尺寸照旧写成 main 开头的 const 常量，方便用户用参数面板校正比例。`;

function buildClient(apiKey, baseUrl) {
  // Key/Base URL 优先使用账户或共享配置，否则回落到环境变量
  // （ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL，SDK 自动读取）；
  // 自定义 Base URL 可接入任何兼容 Anthropic 协议的代理或中转服务
  const options = {};
  if (apiKey) options.apiKey = apiKey;
  if (baseUrl) options.baseURL = baseUrl;
  return new Anthropic(options);
}

/** 中立内容块（{type:'image',mediaType,data} / {type:'text',text}）→ Anthropic 消息格式 */
function toAnthropicMessages(messages) {
  return messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content
        : m.content.map((b) =>
            b.type === "image"
              ? {
                  type: "image",
                  source: { type: "base64", media_type: b.mediaType, data: b.data },
                }
              : { type: "text", text: b.text }
          ),
  }));
}

/**
 * 流式生成建模代码。onEvent 收到 {type:'text',text} / {type:'done',...} / {type:'error',message}
 */
export async function generate(
  { messages, apiKey, model, baseUrl, showThinking = false, effort = "balanced", signal },
  onEvent
) {
  const client = buildClient(apiKey, baseUrl);
  const finalModel = model || DEFAULT_MODEL;
  // Haiku 不支持 output_config.effort 参数，只能用提示词控制
  const isHaiku = finalModel.includes("haiku");

  const params = {
    model: finalModel,
    max_tokens: 32000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }, // 固定部分缓存，精度附加要求放后面不破坏缓存
      },
      ...(EFFORT_PROMPTS[effort] ? [{ type: "text", text: EFFORT_PROMPTS[effort] }] : []),
    ],
    messages: toAnthropicMessages(messages),
  };

  // 快速档不开启思考；均衡/精细用自适应思考（4.6+ 唯一受支持的开启方式），
  // 精细档对支持的模型再加大 effort
  if (effort !== "fast") {
    params.thinking = { type: "adaptive" };
    if (effort === "fine" && !isHaiku) params.output_config = { effort: "max" };
  } else if (!isHaiku) {
    params.output_config = { effort: "low" };
  }

  const stream = client.messages.stream(params, { signal });

  // 管理员开启「显示思考过程」时，把 adaptive thinking 的思考增量也转发给前端
  if (showThinking) {
    stream.on("streamEvent", (event) => {
      if (
        event.type === "content_block_delta" &&
        event.delta?.type === "thinking_delta" &&
        event.delta.thinking
      ) {
        onEvent({ type: "thinking", text: event.delta.thinking });
      }
    });
  }

  stream.on("text", (delta) => onEvent({ type: "text", text: delta }));

  const final = await stream.finalMessage();
  onEvent({
    type: "done",
    stopReason: final.stop_reason,
    usage: {
      input: final.usage.input_tokens,
      output: final.usage.output_tokens,
    },
  });
}
