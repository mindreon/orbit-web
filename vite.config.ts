import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const control = process.env.ORBIT_CONTROL_URL ?? "http://127.0.0.1:8080";
// Where the baize IAM lives for standalone `pnpm dev` sign-in; production reaches /iam same-origin through the edge.
const iam = process.env.ORBIT_IAM_URL ?? "https://dev-4-13.mindreon.com";

export default defineConfig({
  plugins: [react()],
  // The SPA is served under /orbit in every deployment (standalone and wujie sub-app share one artifact).
  base: "/orbit/",
  server: {
    port: 3010,
    strictPort: false,
    // The wujie host (baize dev on :3000) fetches this app's HTML/ESM across ports.
    cors: { origin: true, credentials: true },
    proxy: {
      "/orbit/v1": {
        target: control,
        rewrite: (path) => path.replace(/^\/orbit/, ""),
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
      "/orbit/health": { target: control, rewrite: (path) => path.replace(/^\/orbit/, "") },
      "/health": control,
      "/iam": { target: iam, changeOrigin: true },
    },
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
    // Caddy forwards the public Host header. Vite preview rejects unknown hosts.
    allowedHosts: true,
  },
});
