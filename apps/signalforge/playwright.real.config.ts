import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/real-ui",
  use: { baseURL: "http://127.0.0.1:3006", trace: "retain-on-failure" },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3006",
    url: "http://127.0.0.1:3006",
    reuseExistingServer: false,
    env: {
      ENABLE_DEMO_DATA: "false",
      DISCOVERY_MODE: "offline",
      CACHE_MODE: "memory",
      GROQ_API_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
    },
  },
  workers: 2,
});
