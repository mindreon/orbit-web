import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const control = process.env.ORBIT_CONTROL_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  server: {
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
    port: 3000,
    host: "0.0.0.0",
    // Caddy forwards the public Host header. Vite preview rejects unknown hosts.
    allowedHosts: true,
  },
});
