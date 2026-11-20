import assert from "node:assert/strict";
import { handler } from "../functions/handler.ts";

const base = "http://127.0.0.1:8000/functions/v1/app";

const health = await handler(new Request(`${base}/health`));
assert.equal(health.status, 200);
assert.equal(health.headers.get("Cache-Control"), "no-store");
const body = await health.json();
assert.equal(body.ok, true);
assert.equal(body.service, "touchlight-decoder");
assert.ok(!Number.isNaN(Date.parse(body.timestamp)));

// 网关替换逻辑名后仍要能路由到 health
assert.equal(
  (await handler(new Request("http://127.0.0.1:8000/functions/v1/phys9/health"))).status,
  200,
);
assert.equal((await handler(new Request(`${base}/health/`))).status, 200);

// 未知路径不得返回成功
assert.equal((await handler(new Request(base))).status, 404);
assert.equal((await handler(new Request(`${base}/nope`))).status, 404);

const post = await handler(new Request(`${base}/health`, { method: "POST" }));
assert.equal(post.status, 405);
assert.equal(post.headers.get("Allow"), "GET");

const analyzeGet = await handler(new Request(`${base}/analyze`));
assert.equal(analyzeGet.status, 405);
assert.equal(analyzeGet.headers.get("Allow"), "POST");

console.log("handler checks passed");