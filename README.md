# 触光译码 · 城市无障碍解码局

React 19 + TypeScript + Vite 8 + Tailwind 4 + lucide-react，静态产物在 `dist/`，
服务端逻辑在 `functions/`（Qoder Sites Edge Function，Deno 运行时）。

四个关卡（01 熄灯摸物 / 02 错位路口 / 03 数字盲道 / 04 AI 译码台）均已实现；
04 支持内置样例与真实识别（`POST /functions/v1/app/analyze`）两条路径。

## 本地开发

需要 Node `^22.13.0 || >=24.0.0`。两个终端：

```sh
npm ci
npm run dev:function:node   # 127.0.0.1:8000，本地云函数替身
npm run dev                 # 127.0.0.1:5173，已代理 /functions/v1/app
```

`dev:function:node` 用 Node 直接执行 `functions/handler.ts` 本体，供本机没有 Deno 时使用。
装有 Deno 时改用平台原生入口：

```sh
npm run check:function
npm run dev:function
```

## 检查与构建

```sh
npm run check:handler   # health / analyze 路由契约自检（无需 Deno / 无需浏览器）
npm run check:contract  # 数据契约与发布闸门自检
npm run check:analyze   # analyze 两条本地路径自检（未配置 503 + 本地 Mock 上游，不调真实模型）
npm run check:pages     # pages 发布/读取自检（隔离端口 + 临时文件适配器，不验证云端数据库）
npm run build           # tsc --noEmit + vite build → dist/
npm run preview         # 本地预览 dist/，同样代理云函数
```

## 云函数路由

浏览器只能调用同源 `/functions/v1/app`。`/api` 是 Qoder Sites 平台保留命名空间，
应用不可占用，因此探路接口是：

```
GET /functions/v1/app/health
→ { ok: true, service: "touchlight-decoder", timestamp: "<ISO 8601>" }
```

非 GET 返回 405，未知路径返回 404。网关会把逻辑名 `app` 替换为物理函数名，
handler 只匹配路径末段，不依赖 `app` 字面量。

## 真实识别接口 analyze

```
POST /functions/v1/app/analyze
Content-Type: application/json

{ "sourceType": "image", "image": "data:image/png;base64,…" }
{ "sourceType": "text",  "text": "通知原文…" }
→ { ok: true, sourceType, content: {…9 个内容字段}, warnings: […] }
```

- 每次仅处理 1 张图片（JPG/PNG/WebP Data URL，≤4MB）或 1 段文本（≤10000 字符）；
  拒绝任意外部 http/https 图片 URL；超限返回 400/413，原件不落盘、不持久化。
- 服务端调用 OpenAI 兼容 `${APP_AI_BASE_URL}/chat/completions`（非流式、关闭思考），
  60 秒超时；System Prompt 禁止猜测补全，缺失/模糊/仅二维码必须写入 warnings。
- 未配置环境变量返回 `503 { ok:false, code:"AI_NOT_CONFIGURED" }`，不伪造结果。
- API Key 仅在服务端使用，绝不返回前端。

服务端环境变量（复制 `.env.example` 为 `.env` 后填写，`dev:function:node` 会自动加载）：

```sh
APP_AI_MODEL=qwen3.8-flash
APP_AI_BASE_URL=https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1
APP_AI_API_KEY=<你的百炼密钥，仅服务端>
```

已确认模型为阿里云百炼 Qwen3.8-Flash（调用 ID `qwen3.8-flash`）；
非北京区请改用密钥对应地域的兼容模式地址。未配置时 04 工作台仍可走内置样例。

## 公开分享页 pages 与持久化

```
POST /functions/v1/app/pages   # 只接收经人工核对确认的最终结构化内容
{ confirmed: true, sourceType, warningsResolvedCount, confirmedAt, content: {…9 字段} }
→ 201 { ok: true, id, shareUrl: "/p/<id>", publishedAt }

GET /functions/v1/app/pages/:id
→ 200 { ok, id, content, sourceType, warningsResolvedCount, publishedAt, confirmedAt }
→ 400 INVALID_ID（格式非法） / 404 NOT_FOUND（不存在）
```

- 严禁接收/持久化原始图片、原始输入文本或大模型原始响应；`actionUrl` 若提供只允许
  `http://`/`https://`，拒绝 `javascript:`/`data:`；缺少 `confirmed:true` 一律拒绝。
- 短 ID 由 `crypto.getRandomValues` 生成（10 位 URL 安全字符），冲突自动换新重试。
- 迁移文件：`db/0001_create_pages.sql`（`app.pages`，符合 Qoder Sites 迁移子集；
  `function_backend` 访问模型，`accessPolicies: []`，公开读取经 Function 完成）。
- 生产路径 `functions/index.ts` 注入平台 SDK 真实适配器（`functions/store.ts`
  `createSdkStore`），**无内存兜底**；未注入适配器时 pages 返回 `503 DB_NOT_CONFIGURED`。
- 本地联调：`dev/serve-local.mjs` 注入 `dev/local-store.mjs` 文件适配器
  （默认 `.local-data/pages.json`，可用 `LOCAL_PAGES_FILE` 覆盖），与生产走同一套
  接口与序列化代码路径；仅供本地验证，不代表云端数据库已验证。
- 前端 SPA 路由支持 `/p/:id` 直访与刷新（`src/main.tsx`）；独立分享页
  `src/components/SharePage.tsx` 单 `<main>`/单 `<h1>`，含大字号/高反差/语音工具条。
  部署时需将 `spa` 设为 `true` 以支持深路由刷新（本轮不部署）。

## 目录

```
src/index.css                    暖米白触觉拟物设计系统（--site-* 可被工作台调节）
src/types/accessibility.ts       读取 → 存疑 → 确认 → 发布 四阶段数据契约
src/components/ui/TactileCard    纸感卡片
src/components/ui/TactileButton  盲文键帽按钮（含键盘焦点环）
src/components/BrailleHeader     盲文点阵 + 四阶段切换
functions/index.ts               Deno.serve 部署入口
functions/handler.ts             路由与业务响应
dev/                             本地替身与自检，不进入发布产物
```

## 部署到 Qoder Sites

在本目录的会话中走 `sites-hosting` 流程，`prepare_site` 参数：

- `webDirectory: "dist"`（先执行 `npm run build`）
- `functionDirectory: "functions"`
- `spa: true`（保证 `/p/:id` 可以直接打开和刷新）
- `databaseAccess: "read_write"`，并传入完成迁移后从同一站点取得的 `schemaRef`。
- 声明服务端所需的 `APP_AI_BASE_URL`、`APP_AI_MODEL`、`APP_AI_API_KEY`，在 Qoder Sites 的密钥设置中配置真实值。

不要上传项目根目录、`node_modules`、`dev` 或源码作为 web 产物。