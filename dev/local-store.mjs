// 仅用于本地联调的文件持久化适配器：与生产 SDK 适配器实现同一 PageStore 接口，
// 走同一套序列化代码路径。不是生产代码路径，不进入 functions/ 发布产物。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function createLocalStore(filePath) {
  async function readAll() {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return {};
      throw err;
    }
  }
  async function writeAll(map) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(map), "utf8");
  }
  return {
    async insert(row) {
      const all = await readAll();
      if (all[row.id]) return { inserted: false };
      all[row.id] = row;
      await writeAll(all);
      return { inserted: true };
    },
    async get(id) {
      const all = await readAll();
      return all[id] ?? null;
    },
  };
}