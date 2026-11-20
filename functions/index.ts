import { createDatabaseClient } from "./_qoder/backend.mjs";
import { handler } from "./handler.ts";
import { createSdkStore } from "./store.ts";

// 生产路径：平台注入的数据库 SDK → 真实持久化适配器。无内存兜底。
const store = createSdkStore(createDatabaseClient());

Deno.serve((request) => handler(request, { store }));