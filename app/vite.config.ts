import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Tipos del protocolo generados por ts-rs y vendorizados (ADR-004).
      "@bindings": fileURLToPath(new URL("../bindings", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
