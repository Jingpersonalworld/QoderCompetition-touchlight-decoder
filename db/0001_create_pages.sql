-- 公开无障碍分享页：只存储经人工核对确认的最终结构化内容。
-- 不含原始图片、原始输入文本或大模型原始响应。
-- 符合 Qoder Sites 迁移子集：app schema、text/jsonb/integer/timestamptz、PRIMARY KEY/NOT NULL。
-- function_backend 访问模型：accessPolicies 为 []（平台固定私有策略），公开读取经 Function GET 完成。
CREATE TABLE app.pages (
  id text PRIMARY KEY,
  content jsonb NOT NULL,
  source_type text NOT NULL,
  warnings_resolved_count integer NOT NULL,
  published_at timestamptz NOT NULL,
  confirmed_at timestamptz NOT NULL
);