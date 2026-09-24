import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3010,
    strictPort: false,
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
  },
});
