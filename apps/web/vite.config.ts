import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mist-rag/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@mist-rag/data": path.resolve(__dirname, "../../packages/shared/rag-overview.json"),
    },
  },
  server: {
    port: 5173,
  },
});
