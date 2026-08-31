import { it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
vi.mock("server-only", () => ({}));
// Explicit opt-in server process. Framework loader only; its return is ignored.
// Never read, compare, print or report any loaded credential value.
if (process.env.NODE_ENV !== "development")
  throw new Error("Run npm run verify:runtime explicitly.");
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

it("configured server adapters pass real runtime gates with status-only output", async () => {
  const status: Record<string, string | boolean | number> = {};
  try {
    const { storeConfig } = await import("../src/server/store-config");
    status.storeConfiguration = storeConfig() ? "durable" : "demo_fallback";
  } catch {
    status.storeConfiguration = "invalid";
  }
  try {
    const { snapshotCache, RedisSnapshotCache } = await import(
      "../src/server/intelligence/cache"
    );
    const { Redis } = await import("@upstash/redis");
    const { storeConfig } = await import("../src/server/store-config");
    const { createConnector, definitions } = await import(
      "../src/server/intelligence/service"
    );
    const cache = snapshotCache();
    await cache.get("mcp");
    status.cacheRead = "available";
    // Fixed namespace, 10s expiry. Never overwrite a source observation.
    await cache.lease("runtime-verification", 10);
    status.cacheWrite = "available";
    const configured = storeConfig();
    if (!configured) throw new Error("shared_store_required");
    const { randomUUID, createHmac } = await import("node:crypto");
    const { Ratelimit } = await import("@upstash/ratelimit");
    const redis = new Redis({
      ...configured,
      retry: false,
      signal: () => AbortSignal.timeout(2500),
    });
    const reader = new Redis({
      ...configured,
      retry: false,
      signal: () => AbortSignal.timeout(2500),
    });
    const probeId = randomUUID();
    const probeKey = `sf:verify:v1:cache:${probeId}`;
    try {
      await redis.set(probeKey, { probe: "cache-roundtrip" }, { ex: 30 });
      status.cacheRoundTrip =
        (await reader.get<{ probe: string }>(probeKey))?.probe ===
        "cache-roundtrip";
      status.cacheDelete =
        (await redis.del(probeKey)) === 1 &&
        (await reader.get(probeKey)) === null;
    } finally {
      // Delete this exact probe only; never source snapshots or visitor counters.
      await redis.del(probeKey);
    }
    if (!process.env.RATE_LIMIT_SALT) throw new Error("shared_salt_required");
    const caller = createHmac("sha256", process.env.RATE_LIMIT_SALT)
      .update(probeId)
      .digest("hex");
    const options = {
      limiter: Ratelimit.slidingWindow(2, "10 s"),
      prefix: `sf:verify:v1:limit:${probeId}`,
      analytics: false,
      timeout: 2000,
    };
    const first = new Ratelimit({ ...options, redis, ephemeralCache: false });
    const second = new Ratelimit({
      ...options,
      redis: reader,
      ephemeralCache: false,
    });
    const decisions = [
      await first.limit(caller),
      await second.limit(caller),
      await first.limit(caller),
    ];
    await Promise.all(decisions.map((d) => d.pending));
    status.sharedCounter =
      decisions[0].success &&
      decisions[1].success &&
      !decisions[2].success &&
      decisions.every((d) => d.reason !== "timeout");
    const independent = new RedisSnapshotCache(
      new Redis({
        ...configured,
        retry: false,
        signal: () => AbortSignal.timeout(2500),
      }),
    );
    const jobs: Array<() => Promise<void>> = [];
    for (const definition of definitions) {
      await createConnector(
        definition,
        cache,
        fetch,
        () => Date.now(),
        (job) => jobs.push(job),
      ).discover({ limit: 10 });
    }
    await Promise.all(jobs.map((job) => job()));
    const entries = await Promise.all(
      definitions.map((d) => independent.get(d.id)),
    );
    status.sharedSnapshotMetadata = entries.every((entry) =>
      Boolean(
        entry?.snapshot &&
          entry.snapshot.health &&
          entry.nextAttempt &&
          entry.lastAttempt,
      ),
    );
    status.cache = cache.mode;
  } catch {
    status.cache = "unavailable";
  }
  try {
    const { checkPlanningLimit } = await import("../src/server/planning-limit");
    // Both REST and MCP use these shared categories. Only HMAC keys reach Redis.
    for (const category of ["planning", "catalog", "underwriting"] as const) {
      const limited = await checkPlanningLimit(
        new Request("http://localhost/api/v1/catalog", {
          headers: { "x-forwarded-for": "192.0.2.240" },
        }),
        category,
      );
      status[`${category}Limiter`] = !limited
        ? "allowed"
        : limited.status === 429
          ? "quota_enforced"
          : "unavailable";
    }
  } catch {
    status.limiter = "unavailable";
  }
  try {
    const { frameWithProvider } = await import(
      "../src/server/framing-provider"
    );
    const { ObjectiveInputSchema, ObjectiveFrameSchema } = await import(
      "../src/domain/objective"
    );
    const result = await frameWithProvider(
      ObjectiveInputSchema.parse({
        objective: "Build a verified due diligence route for a startup",
        budgetUsd: 0.25,
        optimizationPolicy: "most_verified",
        mode: "demo",
      }),
      () => {},
      new AbortController().signal,
    );
    status.decomposition = result.source;
    status.frameValid = ObjectiveFrameSchema.safeParse(result.frame).success;
  } catch {
    status.decomposition = "unavailable";
  }
  console.info("Server verification", status);
  if (
    status.storeConfiguration !== "durable" ||
    status.cache !== "shared" ||
    status.cacheRoundTrip !== true ||
    status.cacheDelete !== true ||
    status.sharedCounter !== true ||
    status.sharedSnapshotMetadata !== true ||
    status.decomposition !== "groq" ||
    status.frameValid !== true ||
    !["allowed", "quota_enforced"].includes(String(status.planningLimiter)) ||
    !["allowed", "quota_enforced"].includes(String(status.catalogLimiter))
  ) {
    throw new Error(
      "Configured runtime verification incomplete. See safe status categories above; do not push.",
    );
  }
});
