import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["shared/src/**/*.test.ts", "scorer/src/**/*.test.ts", "agents/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@corpus/shared": fileURLToPath(new URL("./shared/src/index.ts", import.meta.url)),
    },
  },
});
