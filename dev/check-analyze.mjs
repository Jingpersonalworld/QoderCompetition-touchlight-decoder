// 本地接口自检：只起本地 Mock OpenAI 兼容上游，绝不调用真实模型服务。
// 验证两条路径：未配置 503 + health 200；Mock 上游下文本/图片 POST 全链路。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseEnv() {
  const env = { ...process.env };
  delete env.APP_AI_API_KEY;
  delete env.APP_AI_BASE_URL;
  delete env.APP_AI_MODEL;
  return env;
}

async function startFunction(env, port) {
  const child = spawn(process.execPath, ["dev/serve-local.mjs"], {
    cwd: root,
    env: { ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(`[function:${port}] ${d}`));
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/functions/v1/app/health`);
      if (res.ok) return child;
    } catch {
      // 尚未监听，继续等待
    }
    await sleep(150);
  }
  child.kill();
  throw new Error(`本地云函数替身（端口 ${port}）未能就绪`);
}

async function stopFunction(child) {
  child.kill();
  await once(child, "exit");
}

async function postAnalyze(port, payload) {
  const res = await fetch(`http://127.0.0.1:${port}/functions/v1/app/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json() };
}

const MOCK_RESULT = {
  title: "2026 校园无障碍设计开放麦",
  datetime: "本周*晚 7 点左右",
  location: "大学生活动中心 302",
  summaryPoints: ["面向全校开放，无需报名费", "现场提供读屏与语音交互演示"],
  visualAlt: "海报右下角有一个二维码",
  actionGuide: "扫描海报二维码报名",
  actionLabel: "",
  actionUrl: "",
  contactInfo: "",
  warnings: [
    { field: "datetime", severity: "ambiguous", message: "原件时间模糊（本周*晚7点左右），未写明具体日期，请核对" },
    { field: "actionUrl", severity: "unverified_qr", message: "仅有二维码且未写明用途，无法确认指向报名链接，请补充链接或联系方式" },
  ],
};

const received = [];
const mock = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ path: req.url, auth: req.headers.authorization, body });
    if (!req.url.endsWith("/chat/completions")) {
      res.writeHead(404).end("{}");
      return;
    }
    // 故意用 Markdown 代码块包裹，验证服务端容错解析。
    const content = "```json\n" + JSON.stringify(MOCK_RESULT) + "\n```";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
  });
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const mockPort = mock.address().port;

let exitCode = 0;
try {
  // ── 路径一：未配置 APP_AI_API_KEY → 503，health 仍 200 ──
  console.log("── 路径一：未配置环境变量 ──");
  const unconfigured = await startFunction(baseEnv(), 8011);
  try {
    const res = await postAnalyze(8011, { sourceType: "text", text: "测试通知：本周五晚7点招新。" });
    console.log(`POST /functions/v1/app/analyze → ${res.status}`, JSON.stringify(res.body));
    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, "AI_NOT_CONFIGURED");
    assert.match(res.body.error, /APP_AI_API_KEY/);

    const health = await fetch("http://127.0.0.1:8011/functions/v1/app/health");
    const healthBody = await health.json();
    console.log(`GET /functions/v1/app/health → ${health.status}`, JSON.stringify(healthBody));
    assert.equal(health.status, 200);
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.service, "touchlight-decoder");
  } finally {
    await stopFunction(unconfigured);
  }

  // ── 路径二：本地 Mock 上游（非真实大模型）──
  console.log("\n── 路径二：本地 Mock OpenAI 兼容上游（仅本地模拟，非线上真实模型实测）──");
  const env = baseEnv();
  env.APP_AI_BASE_URL = `http://127.0.0.1:${mockPort}/compatible-mode/v1`;
  env.APP_AI_MODEL = "qwen3.8-flash";
  env.APP_AI_API_KEY = "local-mock-key-not-a-real-secret";
  const configured = await startFunction(env, 8012);
  try {
    // 文本 POST：验证 body 完整透传 + 契约解析 + warnings
    const text = "通知：2026 校园无障碍设计开放麦，本周*晚 7 点左右，大学生活动中心 302，扫码报名。" + "补充说明。".repeat(40);
    const textRes = await postAnalyze(8012, { sourceType: "text", text });
    console.log(`POST analyze（文本 ${text.length} 字符）→ ${textRes.status}`);
    console.log("  content.title =", textRes.body.content?.title);
    console.log("  warnings =", JSON.stringify(textRes.body.warnings?.map((w) => ({ field: w.field, severity: w.severity, blocking: w.blocking, status: w.status }))));
    assert.equal(textRes.status, 200);
    assert.equal(textRes.body.ok, true);
    assert.equal(textRes.body.sourceType, "text");
    assert.equal(textRes.body.content.title, MOCK_RESULT.title);
    assert.equal(textRes.body.content.datetime, MOCK_RESULT.datetime);
    assert.deepEqual(textRes.body.content.summaryPoints, MOCK_RESULT.summaryPoints);
    assert.equal(textRes.body.warnings.length, 2);
    assert.equal(textRes.body.warnings[0].fieldLabel, "时间");
    assert.equal(textRes.body.warnings[1].severity, "unverified_qr");
    assert.ok(textRes.body.warnings.every((w) => w.blocking === true && w.status === "pending"));

    const textUpstream = JSON.parse(received.at(-1).body);
    assert.equal(received.at(-1).path, "/compatible-mode/v1/chat/completions");
    assert.equal(received.at(-1).auth, "Bearer local-mock-key-not-a-real-secret");
    assert.equal(textUpstream.model, "qwen3.8-flash");
    assert.equal(textUpstream.stream, false);
    assert.ok(textUpstream.messages[1].content.includes(text), "文本 body 未完整到达上游");
    console.log("  上游收到完整文本 ✓，model/stream/Authorization ✓");

    // 图片 POST：~1.5MB 二进制 → 2MB base64，验证大负载转发不丢数据
    const bytes = Buffer.alloc(1_500_000, 0x41);
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    const imageRes = await postAnalyze(8012, { sourceType: "image", image: dataUrl });
    console.log(`POST analyze（图片 base64 ${(dataUrl.length / 1024 / 1024).toFixed(2)}MB）→ ${imageRes.status}`);
    assert.equal(imageRes.status, 200);
    assert.equal(imageRes.body.ok, true);
    assert.equal(imageRes.body.sourceType, "image");
    assert.equal(imageRes.body.warnings.length, 2);
    const imageUpstream = JSON.parse(received.at(-1).body);
    const forwardedUrl = imageUpstream.messages[1].content.find((p) => p.type === "image_url").image_url.url;
    assert.equal(forwardedUrl, dataUrl, "图片 base64 未完整透传到上游");
    console.log(`  上游收到完整 dataUrl（${forwardedUrl.length} 字符，与发送一致）✓`);

    // 输入校验护栏
    const external = await postAnalyze(8012, { sourceType: "image", image: "https://example.com/poster.png" });
    console.log(`POST analyze（外部 http 图片 URL）→ ${external.status} ${external.body.code}`);
    assert.equal(external.status, 400);
    assert.equal(external.body.code, "EXTERNAL_URL_REJECTED");
    const oversize = await postAnalyze(8012, { sourceType: "text", text: "字".repeat(10_001) });
    console.log(`POST analyze（文本 10001 字符）→ ${oversize.status} ${oversize.body.code}`);
    assert.equal(oversize.status, 413);
    assert.equal(oversize.body.code, "TEXT_TOO_LARGE");
  } finally {
    await stopFunction(configured);
  }

  console.log("\nanalyze self-check passed —— 仅本地 Mock 上游验证，未向任何真实模型服务发送内容。");
} catch (err) {
  exitCode = 1;
  console.error("analyze self-check FAILED:", err);
} finally {
  mock.close();
}
process.exit(exitCode);