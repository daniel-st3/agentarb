import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import RedisMock from "ioredis-mock";
import { clientKey } from "./client-key";
import { limiterConfig, assertProductionLimiterConfig } from "./limiter-config";
import { enforcePublicLimit } from "./public-rate-limit";
import { ROLLING_WINDOW_SCRIPT, WINDOW_MS } from "./rolling-window";
import { GET } from "../app/api/discovery/route";
import { POST } from "../app/api/evaluate/route";
import { TEMPLATE_DEFAULTS } from "../lib/contracts";
import * as discovery from "../lib/discovery";
import * as policy from "../lib/policy";
import * as parsing from "../lib/http-boundary";

const sdk = vi.hoisted(() => ({ evaluate: vi.fn(), options: vi.fn() }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: unknown) {
      sdk.options(options);
    }
    eval = sdk.evaluate;
  },
}));
const address = "203.0.113.24"; // RFC 5737 documentation address, not a visitor.
const salt = randomBytes(32).toString("hex");
const token = randomBytes(48).toString("base64");
let redis: InstanceType<typeof RedisMock>;
function request(
  route: "discovery" | "evaluation" = "discovery",
  ip = address,
) {
  return new Request(
    `https://sandbox.example/api/${route === "evaluation" ? "evaluate" : "discovery"}`,
    {
      method: route === "evaluation" ? "POST" : "GET",
      headers: {
        "x-forwarded-for": ip,
        "x-sandbox-session": randomUUID(),
        "content-type": "application/json",
      },
      ...(route === "evaluation"
        ? {
            body: JSON.stringify({
              ...TEMPLATE_DEFAULTS["Research Analyst"],
              sessionId: randomUUID(),
            }),
          }
        : {}),
    },
  );
}
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://unit-fixture.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token);
  vi.stubEnv("RATE_LIMIT_SALT", salt);
  redis = new RedisMock();
  await redis.flushall();
  sdk.options.mockClear();
  sdk.evaluate
    .mockReset()
    .mockImplementation(
      (script: string, keys: string[], args: (string | number)[]) =>
        redis.eval(script, keys.length, ...keys, ...args),
    );
});
afterEach(() => {
  redis.disconnect();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("distributed admission precedes work", () => {
  it.each([
    ["discovery", 20],
    ["evaluation", 10],
  ] as const)(
    "%s permits %i and rejects the next request even with new sessions",
    async (route, maximum) => {
      const upstream = vi.spyOn(discovery, "discoverPublic").mockResolvedValue({
        opportunities: [discovery.CONTROLLED_OPPORTUNITIES[0]],
        statuses: [],
      });
      const evaluator = vi.spyOn(policy, "evaluateOpportunity");
      const parser = vi.spyOn(parsing, "readLimitedJson");
      const handler = route === "discovery" ? GET : POST;
      for (let i = 0; i < maximum; i++)
        expect((await handler(request(route))).status).toBe(200);
      const denied = await handler(request(route));
      expect(denied.status).toBe(429);
      expect(Number(denied.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(await denied.json()).toEqual({
        error:
          "You’ve reached the public sandbox limit. Please try again shortly.",
      });
      expect(upstream).toHaveBeenCalledTimes(maximum);
      expect(evaluator).toHaveBeenCalledTimes(
        route === "evaluation" ? maximum : 0,
      );
      expect(parser).toHaveBeenCalledTimes(
        route === "evaluation" ? maximum : 0,
      );
      for (let i = 0; i < maximum; i++)
        expect(sdk.evaluate.mock.invocationCallOrder[i]).toBeLessThan(
          upstream.mock.invocationCallOrder[i],
        );
      expect(sdk.options).toHaveBeenCalledWith({
        request: expect.any(Function),
      });
    },
  );

  it("makes no marketplace request, parses no body, and runs no evaluator when Redis fails", async () => {
    sdk.evaluate.mockRejectedValue(
      new Error(`Redis ${token} ${address} https://private.example stack`),
    );
    const network = vi.spyOn(globalThis, "fetch");
    const evaluator = vi.spyOn(policy, "evaluateOpportunity");
    const parser = vi.spyOn(parsing, "readLimitedJson");
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
    ];
    for (const handler of [GET, POST]) {
      const response = await handler(request());
      expect(response.status).toBe(503);
      expect(await response.text()).toBe(
        JSON.stringify({
          error:
            "The public sandbox is temporarily unavailable. Please try again shortly.",
        }),
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(network).not.toHaveBeenCalled();
    expect(evaluator).not.toHaveBeenCalled();
    expect(parser).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [true, 0],
    [1, 5],
    [0, 0],
    [0, -1],
    [0, 601],
    [1],
    [2, 0],
    [1, "0"],
  ])("fails closed on malformed decision %j", async (decision) => {
    sdk.evaluate.mockResolvedValue(decision);
    expect((await enforcePublicLimit(request(), "discovery"))?.status).toBe(
      503,
    );
  });

  it("shares the atomic log across function clients and does not leak a boundary burst", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(599_000);
    const anotherInstance = new RedisMock();
    const key = "arbiter:public:v1:discovery:test-hash";
    const invoke = (client: typeof redis) =>
      client.eval(ROLLING_WINDOW_SCRIPT, 1, key, 20, WINDOW_MS, randomUUID());
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        invoke(i % 2 ? redis : anotherInstance),
      ),
    );
    expect(
      results.filter((value) => (value as number[])[0] === 1),
    ).toHaveLength(20);
    vi.setSystemTime(600_001);
    expect(await invoke(anotherInstance)).toEqual([0, 599]);
    vi.setSystemTime(1_199_001);
    expect(await invoke(anotherInstance)).toEqual([1, 0]);
    expect(await redis.pttl(key)).toBeLessThanOrEqual(WINDOW_MS);
    anotherInstance.disconnect();
  });

  it("retains only hashed keys, random event IDs and timestamps with a ten-minute TTL", async () => {
    await enforcePublicLimit(request(), "discovery");
    const keys = await redis.keys("*");
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^arbiter:public:v1:discovery:[a-f0-9]{64}$/);
    expect(JSON.stringify(sdk.evaluate.mock.calls)).not.toContain(address);
    expect(JSON.stringify(sdk.evaluate.mock.calls)).not.toContain(token);
    expect(await redis.zcard(keys[0])).toBe(1);
    expect(await redis.pttl(keys[0])).toBeGreaterThan(590_000);
  });
});

describe("privacy and trusted proxy", () => {
  it("normalizes IPv6, mapped IPv4, whitespace and valid forwarding chains", () => {
    expect(
      clientKey(request("discovery", `  ${address} , 192.0.2.1`), salt),
    ).toBe(clientKey(request(), salt));
    expect(clientKey(request("discovery", "::ffff:203.0.113.24"), salt)).toBe(
      clientKey(request(), salt),
    );
    expect(clientKey(request("discovery", "2001:0DB8:0000::1"), salt)).toBe(
      clientKey(request("discovery", "2001:db8::1"), salt),
    );
    expect(clientKey(request("discovery", "203.0.113.25"), salt)).not.toBe(
      clientKey(request(), salt),
    );
    expect(clientKey(request(), randomBytes(32).toString("hex"))).not.toBe(
      clientKey(request(), salt),
    );
  });
  it.each([
    "",
    "unknown",
    "203.0.113.24:80",
    "[2001:db8::1]",
    "fe80::1%eth0",
    "1.2.3.04",
    "1.2.3.4,",
    "1.2.3.4, evil.example",
    Array(10).fill("1.2.3.4").join(","),
    "1".repeat(513),
  ])("rejects malformed forwarding %s", async (ip) => {
    expect(
      (await enforcePublicLimit(request("discovery", ip), "discovery"))?.status,
    ).toBe(503);
    expect(sdk.evaluate).not.toHaveBeenCalled();
  });
  it("rejects missing/conflicting forwarding and direct-origin requests", async () => {
    const incoming = request();
    incoming.headers.delete("x-forwarded-for");
    expect((await enforcePublicLimit(incoming, "discovery"))?.status).toBe(503);
    incoming.headers.set("x-forwarded-for", address);
    incoming.headers.set("x-vercel-forwarded-for", "192.0.2.1");
    expect((await enforcePublicLimit(incoming, "discovery"))?.status).toBe(503);
    vi.stubEnv("VERCEL", "");
    expect((await enforcePublicLimit(request(), "discovery"))?.status).toBe(
      503,
    );
    expect(sdk.evaluate).not.toHaveBeenCalled();
  });
});

describe("configuration and local-only fallback", () => {
  it.each([
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "RATE_LIMIT_SALT",
  ])("missing %s fails closed", async (name) => {
    vi.stubEnv(name, undefined);
    expect(() => assertProductionLimiterConfig()).toThrow();
    expect((await enforcePublicLimit(request(), "discovery"))?.status).toBe(
      503,
    );
    expect(sdk.evaluate).not.toHaveBeenCalled();
  });
  it("never permits development fallback in production, on Vercel, or with partial configuration", () => {
    expect(() => limiterConfig({ NODE_ENV: "production" })).toThrow();
    expect(() =>
      assertProductionLimiterConfig({ NODE_ENV: "development" }),
    ).toThrow();
    expect(() =>
      limiterConfig({ NODE_ENV: "development", VERCEL: "1" }),
    ).toThrow();
    expect(() =>
      limiterConfig({ NODE_ENV: "development", VERCEL_ENV: "preview" }),
    ).toThrow();
    expect(() =>
      limiterConfig({ NODE_ENV: "development", RATE_LIMIT_SALT: salt }),
    ).toThrow();
    expect(limiterConfig({ NODE_ENV: "development" })).toEqual({
      mode: "local",
    });
  });
  it.each([
    "http://example.upstash.io",
    "https://example.com",
    "https://user:pass@example.upstash.io",
    "https://example.upstash.io/alternate",
    "https://example.upstash.io?query=1",
  ])("rejects unsafe store URL %s", (url) => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
    expect(() => limiterConfig()).toThrow();
  });
  it("rejects weak salt and public credential exposure", () => {
    vi.stubEnv("RATE_LIMIT_SALT", "a".repeat(64));
    expect(() => limiterConfig()).toThrow();
    vi.stubEnv("RATE_LIMIT_SALT", salt);
    vi.stubEnv("NEXT_PUBLIC_RATE_LIMIT_SALT", salt);
    expect(() => limiterConfig()).toThrow();
  });
  it("local fallback is bounded, shared across spoofed headers, and rejects non-loopback hosts", async () => {
    for (const name of [
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "RATE_LIMIT_SALT",
      "VERCEL",
      "VERCEL_ENV",
    ])
      vi.stubEnv(name, undefined);
    vi.stubEnv("NODE_ENV", "development");
    const local = new Request("http://127.0.0.1/api/evaluate", {
      headers: { "x-forwarded-for": "untrusted" },
    });
    for (let i = 0; i < 10; i++)
      expect(await enforcePublicLimit(local, "evaluation")).toBeNull();
    expect((await enforcePublicLimit(local, "evaluation"))?.status).toBe(429);
    expect((await enforcePublicLimit(request(), "evaluation"))?.status).toBe(
      503,
    );
    expect(sdk.evaluate).not.toHaveBeenCalled();
  });
});
