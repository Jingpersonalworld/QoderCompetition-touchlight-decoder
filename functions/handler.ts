import type { PageContent, PageRow, PageStore } from "./store.ts";

const SERVICE = "touchlight-decoder";
const NO_STORE = { "Cache-Control": "no-store" };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 10_000;
// base64(4MB) ≈ 5.6MB，再加 JSON 包装余量。
const MAX_BODY_CHARS = 6_000_000;
const UPSTREAM_TIMEOUT_MS = 60_000;

const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const STRING_FIELDS = [
  "title",
  "datetime",
  "location",
  "visualAlt",
  "actionGuide",
  "actionLabel",
  "actionUrl",
  "contactInfo",
] as const;

const FIELD_LABELS: Record<string, string> = {
  title: "标题",
  datetime: "时间",
  location: "地点",
  summaryPoints: "正文要点",
  visualAlt: "视觉说明",
  actionGuide: "报名指引",
  actionLabel: "链接名称",
  actionUrl: "报名链接",
  contactInfo: "联系方式",
};

const SEVERITIES = ["missing", "ambiguous", "unverified_qr"];

const SYSTEM_PROMPT = `你是无障碍通知解析器。只提取原件（图片或文本）中明确存在的事实，严禁猜测、推断或补全任何缺失的时间、地点、报名链接、联系方式或二维码用途。
规则：
1. 缺失或模糊的信息：对应字段留空字符串，或原样保留模糊表述（如“本周*晚7点左右”），不得编造具体值。
2. 每个缺失、模糊或无法核实的问题必须写入 warnings 数组，写明字段与原因；仅有二维码而未写明用途时必须标疑（severity 用 unverified_qr），不得假设二维码指向报名链接。
3. actionUrl 只能填原件中明确写出的 http/https 链接；原件只有二维码时留空。
4. summaryPoints 是原件正文要点的字符串数组，逐条忠实概括，不添加原件没有的内容。
5. visualAlt 客观描述图像与二维码的视觉存在，不声称读屏软件能读出其内容。
只输出一个 JSON 对象，不要 Markdown 代码块或任何解释文字，结构如下：
{"title":"","datetime":"","location":"","summaryPoints":[],"visualAlt":"","actionGuide":"","actionLabel":"","actionUrl":"","contactInfo":"","warnings":[{"field":"title|datetime|location|summaryPoints|visualAlt|actionGuide|actionLabel|actionUrl|contactInfo","severity":"missing|ambiguous|unverified_qr","message":"面向核对者的中文说明"}]}`;

// Deno 部署读 Deno.env，本地 Node 替身读 process.env；密钥只在服务端使用。
function readEnv(name: string): string | undefined {
  const g = globalThis as {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
    process?: { env?: Record<string, string | undefined> };
  };
  const value = g.Deno?.env?.get?.(name) ?? g.process?.env?.[name];
  return value && value.trim() ? value.trim() : undefined;
}

function jsonError(status: number, code: string, error: string): Response {
  return Response.json({ ok: false, code, error }, { status, headers: NO_STORE });
}

function methodNotAllowed(allow: string): Response {
  return Response.json(
    { ok: false, code: "method_not_allowed", error: `method_not_allowed` },
    { status: 405, headers: { ...NO_STORE, Allow: allow } },
  );
}

type AnalyzeInput =
  | { kind: "image"; dataUrl: string }
  | { kind: "text"; text: string };

function validateInput(payload: unknown): AnalyzeInput | Response {
  if (typeof payload !== "object" || payload === null) {
    return jsonError(400, "INVALID_INPUT", "请求体需为 JSON 对象");
  }
  const { sourceType, image, text } = payload as Record<string, unknown>;
  if (sourceType === "image") {
    if (typeof image !== "string" || !image) {
      return jsonError(400, "INVALID_INPUT", "缺少图片：请提供 image 字段（Data URL / Base64）");
    }
    if (/^https?:\/\//i.test(image)) {
      return jsonError(400, "EXTERNAL_URL_REJECTED", "不支持外部 http/https 图片链接，请上传 JPG/PNG/WebP 图片文件");
    }
    const match = image.match(IMAGE_DATA_URL);
    if (!match) {
      return jsonError(400, "INVALID_IMAGE", "仅支持 image/jpeg、image/png、image/webp 的 Data URL（base64）");
    }
    const base64 = match[2];
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const bytes = (base64.length * 3) / 4 - padding;
    if (bytes > MAX_IMAGE_BYTES) {
      return jsonError(413, "IMAGE_TOO_LARGE", "图片超过 4MB 限制，请压缩后重试");
    }
    return { kind: "image", dataUrl: image };
  }
  if (sourceType === "text") {
    if (typeof text !== "string" || !text.trim()) {
      return jsonError(400, "INVALID_INPUT", "缺少通知文本：请提供非空 text 字段");
    }
    if (text.length > MAX_TEXT_CHARS) {
      return jsonError(413, "TEXT_TOO_LARGE", `文本超过 ${MAX_TEXT_CHARS} 字符限制，请精简后重试`);
    }
    return { kind: "text", text };
  }
  return jsonError(400, "INVALID_INPUT", "sourceType 需为 image 或 text，且每次仅处理一份输入");
}

function parseModelJson(raw: string): unknown | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sanitizeResult(
  parsed: unknown,
): { content: Record<string, unknown>; warnings: Record<string, unknown>[] } | Response {
  if (typeof parsed !== "object" || parsed === null) {
    return jsonError(502, "MODEL_OUTPUT_INVALID", "模型返回结果不是 JSON 对象，请重试");
  }
  const source = parsed as Record<string, unknown>;
  const content: Record<string, unknown> = {};
  for (const field of STRING_FIELDS) {
    const value = source[field];
    if (value === undefined || value === null) {
      content[field] = "";
    } else if (typeof value === "string") {
      content[field] = value;
    } else {
      return jsonError(502, "MODEL_OUTPUT_INVALID", `模型返回字段 ${field} 类型非法（应为字符串）`);
    }
  }
  const points = source.summaryPoints;
  if (points === undefined || points === null) {
    content.summaryPoints = [];
  } else if (Array.isArray(points) && points.every((p) => typeof p === "string")) {
    content.summaryPoints = points;
  } else {
    return jsonError(502, "MODEL_OUTPUT_INVALID", "模型返回字段 summaryPoints 类型非法（应为字符串数组）");
  }
  const rawWarnings = source.warnings ?? [];
  if (!Array.isArray(rawWarnings)) {
    return jsonError(502, "MODEL_OUTPUT_INVALID", "模型返回字段 warnings 类型非法（应为数组）");
  }
  const warnings: Record<string, unknown>[] = [];
  for (const [index, entry] of rawWarnings.entries()) {
    if (typeof entry !== "object" || entry === null) {
      return jsonError(502, "MODEL_OUTPUT_INVALID", "warnings 中存在非对象条目");
    }
    const { field, severity, message } = entry as Record<string, unknown>;
    if (typeof field !== "string" || !(field in FIELD_LABELS)) {
      return jsonError(502, "MODEL_OUTPUT_INVALID", "warnings 中存在未知 field");
    }
    if (typeof message !== "string" || !message.trim()) {
      return jsonError(502, "MODEL_OUTPUT_INVALID", "warnings 中存在缺少 message 的条目");
    }
    warnings.push({
      id: `ai-w-${index}`,
      field,
      fieldLabel: FIELD_LABELS[field],
      severity: typeof severity === "string" && SEVERITIES.includes(severity) ? severity : "ambiguous",
      blocking: true,
      message,
      status: "pending",
    });
  }
  return { content, warnings };
}

async function analyze(request: Request): Promise<Response> {
  const apiKey = readEnv("APP_AI_API_KEY");
  const baseUrl = readEnv("APP_AI_BASE_URL");
  const model = readEnv("APP_AI_MODEL");
  if (!apiKey || !baseUrl || !model) {
    return jsonError(
      503,
      "AI_NOT_CONFIGURED",
      "服务端未配置模型服务环境变量（APP_AI_API_KEY / APP_AI_BASE_URL / APP_AI_MODEL）",
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError(400, "BAD_BODY", "无法读取请求体");
  }
  if (raw.length > MAX_BODY_CHARS) {
    return jsonError(413, "INPUT_TOO_LARGE", "请求体过大：图片请不超过 4MB，文本请不超过 10000 字符");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonError(400, "BAD_JSON", "请求体不是合法 JSON");
  }
  const input = validateInput(payload);
  if (input instanceof Response) return input;

  // 原件只驻留在本次请求内存中，不落盘、不持久化。
  const userContent =
    input.kind === "image"
      ? [
          { type: "text", text: "请解析这张通知图片，按系统要求只输出 JSON。" },
          { type: "image_url", image_url: { url: input.dataUrl } },
        ]
      : `请解析以下通知文本，按系统要求只输出 JSON。\n\n${input.text}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        enable_thinking: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      return jsonError(504, "UPSTREAM_TIMEOUT", "模型服务响应超时（60 秒），请稍后重试");
    }
    return jsonError(502, "UPSTREAM_UNREACHABLE", "无法连接模型服务，请检查网络或 APP_AI_BASE_URL 配置");
  } finally {
    clearTimeout(timer);
  }
  if (!upstream.ok) {
    return jsonError(502, "UPSTREAM_ERROR", `模型服务返回 HTTP ${upstream.status}，请检查密钥、模型与地域配置`);
  }
  let completion: unknown;
  try {
    completion = await upstream.json();
  } catch {
    return jsonError(502, "UPSTREAM_BAD_JSON", "模型服务返回内容不是合法 JSON");
  }
  const contentText = (completion as {
    choices?: { message?: { content?: unknown } }[];
  })?.choices?.[0]?.message?.content;
  if (typeof contentText !== "string" || !contentText.trim()) {
    return jsonError(502, "UPSTREAM_BAD_SHAPE", "模型服务返回结构缺少 choices[0].message.content");
  }
  const parsed = parseModelJson(contentText);
  if (parsed === null) {
    return jsonError(502, "MODEL_OUTPUT_INVALID", "模型返回结果无法解析为 JSON，请重试");
  }
  const result = sanitizeResult(parsed);
  if (result instanceof Response) return result;

  return Response.json(
    { ok: true, sourceType: input.kind, content: result.content, warnings: result.warnings },
    { headers: NO_STORE },
  );
}

const PAGE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const PAGE_ID_LENGTH = 10;
const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,10}$/;
const MAX_PAGE_BODY_CHARS = 256_000;
const MAX_SUMMARY_POINTS = 50;
const MAX_POINT_CHARS = 2000;

function newPageId(): string {
  const bytes = new Uint8Array(PAGE_ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += PAGE_ID_ALPHABET[byte % PAGE_ID_ALPHABET.length];
  return id;
}

function validatePagePayload(
  payload: unknown,
): Omit<PageRow, "id" | "publishedAt"> | Response {
  if (typeof payload !== "object" || payload === null) {
    return jsonError(400, "INVALID_INPUT", "请求体需为 JSON 对象");
  }
  const body = payload as Record<string, unknown>;
  if (body.confirmed !== true) {
    return jsonError(400, "UNCONFIRMED_CONTENT", "仅接受经人工核对确认的内容：缺少显式发布确认标记 confirmed:true");
  }
  if (body.sourceType !== "image" && body.sourceType !== "text") {
    return jsonError(400, "INVALID_INPUT", "sourceType 需为 image 或 text");
  }
  const count = body.warningsResolvedCount;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    return jsonError(400, "INVALID_INPUT", "warningsResolvedCount 需为非负整数");
  }
  if (typeof body.confirmedAt !== "string" || Number.isNaN(Date.parse(body.confirmedAt))) {
    return jsonError(400, "INVALID_INPUT", "confirmedAt 需为合法 ISO 8601 时间戳");
  }
  const raw = body.content;
  if (typeof raw !== "object" || raw === null) {
    return jsonError(400, "INVALID_INPUT", "缺少 content 结构化内容对象");
  }
  const c = raw as Record<string, unknown>;
  const content: PageContent = {
    title: "", datetime: "", location: "", summaryPoints: [],
    visualAlt: "", actionGuide: "", actionLabel: "", actionUrl: "", contactInfo: "",
  };
  for (const field of STRING_FIELDS) {
    const value = c[field];
    if (typeof value !== "string") {
      return jsonError(400, "INVALID_CONTENT", `content.${field} 需为字符串`);
    }
    content[field] = value;
  }
  if (!content.title.trim()) {
    return jsonError(400, "INVALID_CONTENT", "content.title 不能为空");
  }
  const points = c.summaryPoints;
  if (!Array.isArray(points) || !points.every((p) => typeof p === "string")) {
    return jsonError(400, "INVALID_CONTENT", "content.summaryPoints 需为字符串数组");
  }
  if (points.length > MAX_SUMMARY_POINTS || points.some((p) => p.length > MAX_POINT_CHARS)) {
    return jsonError(413, "CONTENT_TOO_LARGE", "正文要点超出长度限制");
  }
  content.summaryPoints = points;
  const url = content.actionUrl.trim();
  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return jsonError(400, "INVALID_ACTION_URL", "报名链接格式不正确");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return jsonError(400, "INVALID_ACTION_URL", "报名链接只允许 http:// 或 https:// 协议");
    }
  }
  return {
    content,
    sourceType: body.sourceType,
    warningsResolvedCount: count,
    confirmedAt: body.confirmedAt,
  };
}

async function createPage(request: Request, store: PageStore): Promise<Response> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError(400, "BAD_BODY", "无法读取请求体");
  }
  if (raw.length > MAX_PAGE_BODY_CHARS) {
    return jsonError(413, "INPUT_TOO_LARGE", "发布内容过大（本接口只接收核对后的结构化文字，不含原图/原文）");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonError(400, "BAD_JSON", "请求体不是合法 JSON");
  }
  const validated = validatePagePayload(payload);
  if (validated instanceof Response) return validated;

  const publishedAt = new Date().toISOString();
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = newPageId();
      const row: PageRow = { id, publishedAt, ...validated };
      const { inserted } = await store.insert(row);
      if (inserted) {
        return Response.json(
          { ok: true, id, shareUrl: `/p/${id}`, publishedAt },
          { status: 201, headers: NO_STORE },
        );
      }
    }
    return jsonError(503, "ID_GENERATION_FAILED", "短 ID 连续冲突，请稍后重试");
  } catch {
    return jsonError(503, "DB_ERROR", "持久化服务暂时不可用，请稍后重试");
  }
}

async function getPage(id: string, store: PageStore): Promise<Response> {
  if (!PAGE_ID_PATTERN.test(id)) {
    return jsonError(400, "INVALID_ID", "分享链接 ID 格式非法");
  }
  let row: PageRow | null;
  try {
    row = await store.get(id);
  } catch {
    return jsonError(503, "DB_ERROR", "持久化服务暂时不可用，请稍后重试");
  }
  if (!row) {
    return jsonError(404, "NOT_FOUND", "页面不存在或已被移除");
  }
  return Response.json(
    {
      ok: true,
      id: row.id,
      content: row.content,
      sourceType: row.sourceType,
      warningsResolvedCount: row.warningsResolvedCount,
      publishedAt: row.publishedAt,
      confirmedAt: row.confirmedAt,
    },
    { headers: NO_STORE },
  );
}

export interface HandlerDeps {
  store?: PageStore;
}

export async function handler(request: Request, deps: HandlerDeps = {}): Promise<Response> {
  // 网关会把逻辑名 app 换成物理函数名，所以只认路径末段，不假设含 "app"。
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const route = segments[segments.length - 1];

  if (route === "health") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return Response.json(
      { ok: true, service: SERVICE, timestamp: new Date().toISOString() },
      { headers: NO_STORE },
    );
  }

  if (route === "analyze") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return analyze(request);
  }

  if (route === "pages") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    if (!deps.store) return jsonError(503, "DB_NOT_CONFIGURED", "服务端未配置持久化适配器");
    return createPage(request, deps.store);
  }

  if (segments[segments.length - 2] === "pages") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    if (!deps.store) return jsonError(503, "DB_NOT_CONFIGURED", "服务端未配置持久化适配器");
    return getPage(route, deps.store);
  }

  return Response.json(
    { ok: false, code: "not_found", error: "not_found" },
    { status: 404, headers: NO_STORE },
  );
}