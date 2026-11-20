// 本地接口自检：隔离端口 + 临时文件持久化适配器，验证 pages 发布/读取代码路径。
// 不读取 .env、不调用真实百炼、不申请云资源。严禁据此声称已验证云端数据库。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 8013;
const base = `http://127.0.0.1:${PORT}/functions/v1/app`;
const dataFile = join(tmpdir(), `tl-pages-test-${Date.now()}.json`);

function baseEnv() {
  const env = { ...process.env };
  delete env.APP_AI_API_KEY;
  delete env.APP_AI_BASE_URL;
  delete env.APP_AI_MODEL;
  return env;
}

const child = spawn(process.execPath, ["dev/serve-local.mjs"], {
  cwd: root,
  env: { ...baseEnv(), PORT: String(PORT), LOCAL_PAGES_FILE: dataFile },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stderr.on("data", (d) => process.stderr.write(`[function:${PORT}] ${d}`));

async function waitReady() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {
      // 尚未监听
    }
    await sleep(150);
  }
  throw new Error("本地云函数替身未能就绪");
}

async function post(path, payload) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}
async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
}

const validPayload = {
  confirmed: true,
  sourceType: "text",
  warningsResolvedCount: 2,
  confirmedAt: new Date().toISOString(),
  content: {
    title: "2026 校园无障碍设计开放麦",
    datetime: "2026-11-21 19:00",
    location: "大学生活动中心 302",
    summaryPoints: ["面向全校开放，无需报名费", "现场提供读屏与语音交互演示"],
    visualAlt: "海报右下角有一个二维码",
    actionGuide: "点击链接填写报名表",
    actionLabel: "打开开放麦报名表",
    actionUrl: "https://example.com/openmic",
    contactInfo: "access@club.example.edu",
  },
};

let exitCode = 0;
try {
  await waitReady();

  console.log("── POST /pages：合法发布 ──");
  const created = await post("/pages", validPayload);
  console.log(`→ ${created.status}`, JSON.stringify({ ok: created.body.ok, id: created.body.id, shareUrl: created.body.shareUrl }));
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.match(created.body.id, /^[A-Za-z0-9_-]{10}$/);
  assert.equal(created.body.shareUrl, `/p/${created.body.id}`);
  assert.ok(!Number.isNaN(Date.parse(created.body.publishedAt)));
  const id = created.body.id;

  console.log("\n── POST /pages：非法报名链接协议拦截 ──");
  for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"]) {
    const res = await post("/pages", { ...validPayload, content: { ...validPayload.content, actionUrl: url } });
    console.log(`actionUrl=${url.slice(0, 24)}… → ${res.status} ${res.body.code}`);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "INVALID_ACTION_URL");
  }

  console.log("\n── POST /pages：未确认内容拦截 ──");
  const unconfirmed = await post("/pages", { ...validPayload, confirmed: false });
  console.log(`confirmed:false → ${unconfirmed.status} ${unconfirmed.body.code}`);
  assert.equal(unconfirmed.status, 400);
  assert.equal(unconfirmed.body.code, "UNCONFIRMED_CONTENT");
  const missingFlag = await post("/pages", { ...validPayload, confirmed: undefined });
  assert.equal(missingFlag.status, 400);
  assert.equal(missingFlag.body.code, "UNCONFIRMED_CONTENT");

  console.log("\n── GET /pages/:id：正常读取 ──");
  const read = await get(`/pages/${id}`);
  console.log(`→ ${read.status} content.title=${read.body.content?.title}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.ok, true);
  assert.equal(read.body.id, id);
  assert.equal(read.body.content.title, validPayload.content.title);
  assert.deepEqual(read.body.content.summaryPoints, validPayload.content.summaryPoints);
  assert.equal(read.body.content.actionUrl, validPayload.content.actionUrl);

  console.log("\n── GET /pages/:id：400 非法 ID / 404 不存在 ──");
  const badId = await get("/pages/invalid!!");
  console.log(`非法 ID → ${badId.status} ${badId.body.code}`);
  assert.equal(badId.status, 400);
  assert.equal(badId.body.code, "INVALID_ID");
  const missing = await get("/pages/AAAAAAAAAA");
  console.log(`合法格式但不存在 → ${missing.status} ${missing.body.code}`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "NOT_FOUND");

  console.log("\n── 持久化内容审查（仅核对后结构化文字，无原图/原文）──");
  const persisted = JSON.parse(await readFile(dataFile, "utf8"));
  const row = persisted[id];
  assert.ok(row, "临时适配器应已持久化该记录");
  assert.equal(row.content.title, validPayload.content.title);
  assert.ok(!JSON.stringify(persisted).includes("data:image"), "不得持久化原始图片");
  console.log("持久化键:", Object.keys(row).join(", "), "✓ 无 data:image ✓");

  console.log("\n── 既有接口回归 ──");
  const health = await get("/health");
  console.log(`GET /health → ${health.status} ok=${health.body.ok}`);
  assert.equal(health.status, 200);
  assert.equal(health.body.service, "touchlight-decoder");
  const analyzeGet = await get("/analyze");
  assert.equal(analyzeGet.status, 405);
  const analyzeProbe = await post("/analyze", { sourceType: "image", image: "https://example.com/a.png" });
  console.log(`POST /analyze（外部 URL 探针，未配置 env）→ ${analyzeProbe.status} ${analyzeProbe.body.code}`);
  assert.equal(analyzeProbe.status, 503);
  assert.equal(analyzeProbe.body.code, "AI_NOT_CONFIGURED");

  console.log("\npages self-check passed —— 仅本地临时文件适配器验证代码路径，未验证云端数据库。");
} catch (err) {
  exitCode = 1;
  console.error("pages self-check FAILED:", err);
} finally {
  child.kill();
  await once(child, "exit").catch(() => {});
  await unlink(dataFile).catch(() => {});
  // 等待 libuv 句柄收尾，避免 Windows 上强制 exit 触发 async.c 断言。
  await sleep(200);
}
process.exit(exitCode);