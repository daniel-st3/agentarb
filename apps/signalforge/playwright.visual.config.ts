import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./tests/visual",
  testMatch: "*.spec.ts",
  outputDir: process.env.VALRUN_VISUAL_DIR ?? "/tmp/valrun-layout-final",
  globalSetup: "./tests/visual/setup.ts",
  workers: 2,
  projects: [
    { name: "1920", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
