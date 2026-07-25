import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@deployment": fileURLToPath(new URL("../shared/deployments/local.json", import.meta.url)),
      "@abi": fileURLToPath(new URL("../shared/src/abi.ts", import.meta.url)),
    },
  },
  server: { port: 5000, strictPort: true, host: "0.0.0.0", allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL("./index.html", import.meta.url)),
        app: fileURLToPath(new URL("./app.html", import.meta.url)),
      },
    },
  },
});
