import { defineConfig } from "astro/config";

// Superficie pública 100 % estática (ADR-002): aquí se ejecutan las
// mediciones Lighthouse (RNF-02). Sin islas ni JavaScript de framework en la
// landing; Astro inline-a el CSS pequeño automáticamente (CSS crítico).
export default defineConfig({
  site: "https://rutsubo.dev",
  server: { port: 4321 },
  build: {
    inlineStylesheets: "always",
  },
});
