import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxy = { "/functions/v1/app": "http://127.0.0.1:8000" };

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    proxy,
    // Windows 上 .env 可能被占用导致 EBUSY 崩溃；密钥文件不参与前端热更新监听。
    watch: { ignored: ["**/.env", "**/.env.*"] },
  },
  preview: { host: "127.0.0.1", proxy },
  build: { outDir: "dist" },
});
