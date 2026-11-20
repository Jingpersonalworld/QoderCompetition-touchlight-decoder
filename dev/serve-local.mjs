// 本机没有 Deno 时的本地替身：跑的是 functions/handler.ts 本体，不是模拟数据。
// 部署入口仍是 functions/index.ts（Deno.serve）。
import { createServer } from "node:http";
import { resolve } from "node:path";
import { handler } from "../functions/handler.ts";
import { createLocalStore } from "./local-store.mjs";

const PORT = Number(process.env.PORT ?? 8000);
// 本地联调注入文件持久化适配器（生产路径由 functions/index.ts 注入真实 SDK）。
const store = createLocalStore(
  resolve(process.env.LOCAL_PAGES_FILE ?? ".local-data/pages.json"),
);

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const headers = new Headers();
  if (req.headers["content-type"]) {
    headers.set("content-type", req.headers["content-type"]);
  }
  const hasBody = body.length > 0 && req.method !== "GET" && req.method !== "HEAD";
  const response = await handler(
    new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? body : undefined,
    }),
    { store },
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`local function on http://127.0.0.1:${PORT}`);
});