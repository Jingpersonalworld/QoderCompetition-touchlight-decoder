import assert from "node:assert/strict";
import { getBlockingIssues } from "../src/types/accessibility.ts";

const content = {
  title: "t",
  datetime: "2026-11-20 19:00",
  location: "l",
  summaryPoints: ["a"],
  visualAlt: "v",
  actionGuide: "g",
  actionLabel: "打开报名表",
  actionUrl: "https://example.com/join",
  contactInfo: "",
};
const warning = (over = {}) => ({
  id: "w",
  field: "datetime",
  fieldLabel: "时间",
  severity: "ambiguous",
  blocking: true,
  message: "请核对时间",
  status: "pending",
  ...over,
});

// 阻断项未确认 → 有提示
assert.equal(getBlockingIssues([warning()], content).length, 1);
// edited 不算确认
assert.equal(getBlockingIssues([warning({ status: "edited" })], content).length, 1);
// confirmed 且链接有效 → 放行
assert.deepEqual(getBlockingIssues([warning({ status: "confirmed" })], content), []);
// 非阻断项未确认不拦截
assert.deepEqual(
  getBlockingIssues([warning({ blocking: false })], content),
  [],
);
// 链接与联系方式均空 → 即使全部确认也拦截
assert.equal(
  getBlockingIssues([warning({ status: "confirmed" })], {
    ...content,
    actionUrl: "  ",
    contactInfo: "",
  }).length,
  1,
);
// 仅联系方式也可放行
assert.deepEqual(
  getBlockingIssues([warning({ status: "confirmed" })], {
    ...content,
    actionUrl: "",
    contactInfo: "QQ 群 123456",
  }),
  [],
);

console.log("contract checks passed");