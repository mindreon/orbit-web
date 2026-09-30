import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const control = process.env.ORBIT_CONTROL_URL ?? "http://127.0.0.1:8080";

// 嵌入 baize 时用 ORBIT_WEB_BASE=/orbit/ 构建，与基座注册表的入口路径对齐；独立部署保持 /。
const base = process.env.ORBIT_WEB_BASE ?? "/";
// wujie 跨端口取 HTML/ESM，dev server 需要放行基座源。
const embedOrigin = process.env.ORBIT_EMBED_ORIGIN;
const embedCors = embedOrigin ? { origin: embedOrigin, credentials: true } : undefined;

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    cors: embedCors,
    port: 3010,
    strictPort: false,
    proxy: {
      "/v1": {
        target: control,
        // When orbit-control drops an SSE stream, the dev proxy otherwise keeps the browser side open forever,
        // so the page never notices and never reconnects.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            proxyRes.on("close", () => {
              if (!res.writableEnded) res.destroy();
            });
          });
        },
      },
      "/health": control,
    },
  },
  preview: {
    cors: embedCors,
    port: 3000,
    host: "0.0.0.0",
    // Caddy forwards the public Host header. Vite preview rejects unknown hosts.
    allowedHosts: true,
  },
});
