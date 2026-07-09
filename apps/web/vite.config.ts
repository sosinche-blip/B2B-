import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const workerOrigin = process.env.VITE_WORKER_PROXY_TARGET || "http://127.0.0.1:8787";
const webPort = Number(process.env.VITE_WEB_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: webPort,
    strictPort: true,
    proxy: {
      "/api": {
        target: workerOrigin,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
