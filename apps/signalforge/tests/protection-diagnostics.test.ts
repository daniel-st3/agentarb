import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  storeConfig,
  StoreConfigurationError,
} from "../src/server/store-config";
import { checkPlanningLimit } from "../src/server/planning-limit";
import { publicDiscoveryGet } from "../src/server/intelligence/transport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  [{ CACHE_MODE: "invalid" }, "cache_mode_invalid"],
  [{ CACHE_MODE: "durable" }, "durable_pair_missing"],
  [
    {
      UPSTASH_REDIS_REST_URL: "https://localhost",
      UPSTASH_REDIS_REST_TOKEN: "test-only-placeholder",
    },
    "durable_url_invalid",
  ],
] as const)(
  "reports fixed configuration categories without configuration values",
  (env, code) => {
    try {
      storeConfig(env);
      throw new Error("should have rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(StoreConfigurationError);
      expect((error as StoreConfigurationError).code).toBe(code);
      expect((error as Error).message).toBe("store_unavailable");
      expect(JSON.stringify(error)).not.toContain("test-only-placeholder");
      expect(JSON.stringify(error)).not.toContain("https://localhost");
    }
  },
);

it("a hosted deployment fails closed with useful server diagnostics and generic public output", async () => {
  vi.stubEnv("CACHE_MODE", "durable");
  for (const key of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ])
    vi.stubEnv(key, "");
  vi.stubEnv("VERCEL", "1");
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  const response = await checkPlanningLimit(
    new Request("https://example.test/api/v1/catalog"),
  );
  expect(response?.status).toBe(503);
  expect(log).toHaveBeenCalledWith("public_protection_unavailable", {
    category: "configuration",
    configurationCode: "durable_pair_missing",
  });
  expect(await response?.text()).not.toMatch(
    /Redis|Upstash|configurationCode|durable_pair_missing/,
  );
});

it.each([
  "text/html; note=json",
  "application/notjson",
  "text/plain-json",
  "application/jsonp",
])("rejects misleading content type %s before parsing", async (type) => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("{}", { headers: { "Content-Type": type } }),
    );
  await expect(publicDiscoveryGet("mcp", fetcher)).rejects.toThrow(
    "upstream_unavailable",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("accepts the documented JSON media type with a charset", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response('{"servers":[]}', {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
    );
  expect(await publicDiscoveryGet("mcp", fetcher)).toEqual({ servers: [] });
});
