import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3010,
    strictPort: false,
    proxy: {
      "/v1": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
    },
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
    // Caddy forwards the public Host header. Vite preview rejects unknown hosts.
    allowedHosts: true,
  },
});
