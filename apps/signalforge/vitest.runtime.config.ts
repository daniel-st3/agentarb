import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Explicit opt-in server verification only; never part of hermetic unit tests.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["scripts/runtime-check.test.ts"], testTimeout: 60000 },
});
