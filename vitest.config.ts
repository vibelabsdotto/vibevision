import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    pool: "forks",
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src")
    }
  }
});