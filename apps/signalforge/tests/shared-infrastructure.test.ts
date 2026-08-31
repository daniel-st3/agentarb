import { beforeEach, afterEach, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  limit: vi.fn(),
  redisOptions: [] as Record<string, unknown>[],
  limiterOptions: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: Record<string, unknown>) {
      fake.redisOptions.push(options);
    }
    get = fake.get;
    set = fake.set;
  },
}));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = (count: number, duration: string) => ({
      count,
      duration,
    });
    constructor(options: Record<string, unknown>) {
      fake.limiterOptions.push(options);
    }
    limit = fake.limit;
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fake.redisOptions.length = 0;
  fake.limiterOptions.length = 0;
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fixture.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-placeholder");
  vi.stubEnv("RATE_LIMIT_SALT", "synthetic-test-salt-not-a-real-secret");
  vi.stubEnv("CACHE_MODE", "redis");
});
afterEach(() => vi.unstubAllEnvs());
const request = (address = "192.0.2.71") =>
  new Request("https://example.com/api/v1/catalog", {
    headers: { "x-forwarded-for": address },
  });
it("shared limit hashes normalized clients and uses sliding windows without analytics", async () => {
  fake.limit.mockResolvedValue({ success: true, reset: Date.now() + 600000 });
  const { checkPlanningLimit } = await import("../src/server/planning-limit");
  expect(await checkPlanningLimit(request())).toBeNull();
  expect(await checkPlanningLimit(request())).toBeNull();
  expect(await checkPlanningLimit(request("192.0.2.72"), "catalog")).toBeNull();
  const keys = fake.limit.mock.calls.map((c) => c[0]);
  expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).not.toBe(keys[2]);
  expect(fake.limiterOptions[0]).toMatchObject({
    analytics: false,
    timeout: 2000,
    limiter: { count: 10, duration: "10 m" },
  });
  expect(fake.limiterOptions[2]).toMatchObject({
    limiter: { count: 60, duration: "10 m" },
  });
  expect(fake.redisOptions[0]).toMatchObject({
    retry: false,
    signal: expect.any(Function),
  });
});
it.each([
  { success: true, reset: 1, reason: "timeout" },
  { success: "yes", reset: 1 },
  { success: true, reset: NaN },
])("invalid shared decision fails closed", async (result) => {
  fake.limit.mockResolvedValue(result);
  const { checkPlanningLimit } = await import("../src/server/planning-limit");
  const denied = await checkPlanningLimit(request());
  expect(denied?.status).toBe(503);
  expect(await denied?.text()).not.toMatch(
    /upstash|redis|192.0|test-placeholder|stack/i,
  );
});
it("shared infrastructure exception never leaks the raw failure", async () => {
  fake.limit.mockRejectedValue(new Error("private infrastructure failure"));
  const { checkPlanningLimit } = await import("../src/server/planning-limit");
  const denied = await checkPlanningLimit(request());
  expect(denied?.status).toBe(503);
  expect(await denied?.text()).not.toContain("private infrastructure");
});
it("shared rejection returns a safe retry interval", async () => {
  fake.limit.mockResolvedValue({ success: false, reset: Date.now() + 60000 });
  const { checkPlanningLimit } = await import("../src/server/planning-limit");
  const denied = await checkPlanningLimit(request());
  expect(denied?.status).toBe(429);
  expect(Number(denied?.headers.get("Retry-After"))).toBeGreaterThan(0);
});
it("normalized IPv6 and salt determine keys; raw addresses are never sent or logged", async () => {
  fake.limit.mockResolvedValue({ success: true, reset: Date.now() + 600000 });
  const log = vi.spyOn(console, "log"),
    warn = vi.spyOn(console, "warn"),
    error = vi.spyOn(console, "error");
  const { checkPlanningLimit } = await import("../src/server/planning-limit");
  await checkPlanningLimit(request("2001:0db8:0000:0000:0000:0000:0000:0001"));
  await checkPlanningLimit(request("2001:db8::1"));
  expect(fake.limit.mock.calls[0][0]).toBe(fake.limit.mock.calls[1][0]);
  vi.stubEnv("RATE_LIMIT_SALT", "another-synthetic-salt-not-a-real-secret");
  await checkPlanningLimit(request("2001:db8::1"));
  expect(fake.limit.mock.calls[0][0]).not.toBe(fake.limit.mock.calls[2][0]);
  expect(
    fake.limit.mock.calls.every(([key]) => /^[a-f0-9]{64}$/.test(key)),
  ).toBe(true);
  expect(JSON.stringify(fake.limit.mock.calls)).not.toContain("2001:");
  expect(log).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it("read-only credentials cannot bypass shared counters or durable writes", async () => {
  fake.get.mockResolvedValue(null);
  fake.set.mockRejectedValue(new Error("NOPERM synthetic fixture"));
  fake.limit.mockRejectedValue(new Error("NOPERM synthetic fixture"));
  const { snapshotCache } = await import("../src/server/intelligence/cache");
  expect(await snapshotCache().get("mcp")).toBeNull();
  await expect(snapshotCache().lease("mcp", 60)).rejects.toThrow();
  const { checkPlanningLimit } = await import("../src/server/planning-limit");
  const denied = await checkPlanningLimit(request());
  expect(denied?.status).toBe(503);
  expect(await denied?.text()).not.toMatch(
    /NOPERM|fixture|redis|upstash|192\.0/i,
  );
});
it.each(["", "too-short"])(
  "invalid salt prevents any shared limit operation",
  async (salt) => {
    vi.stubEnv("RATE_LIMIT_SALT", salt);
    const { checkPlanningLimit } = await import("../src/server/planning-limit");
    expect((await checkPlanningLimit(request()))?.status).toBe(503);
    expect(fake.limit).not.toHaveBeenCalled();
  },
);
it("shared cache stores only validated source snapshots with expiry and atomic refresh leases", async () => {
  fake.set.mockResolvedValue("OK");
  fake.get.mockResolvedValue(null);
  const { snapshotCache } = await import("../src/server/intelligence/cache");
  const cache = snapshotCache();
  expect(cache.mode).toBe("shared");
  const entry = {
    nextAttempt: 1,
    failures: 0,
    lastAttempt: "2026-08-30T00:00:00.000Z",
    error: false,
  };
  await cache.set("mcp", entry);
  expect(fake.set).toHaveBeenCalledWith("sf:catalog:v2:mcp", entry, {
    ex: 172800,
  });
  expect(await cache.lease("mcp", 3600)).toBe(true);
  expect(fake.set).toHaveBeenCalledWith("sf:catalog:v2:lease:mcp", "1", {
    nx: true,
    ex: 3600,
  });
  fake.get.mockResolvedValue({ unexpected: "untrusted" });
  await expect(cache.get("mcp")).rejects.toThrow();
});
