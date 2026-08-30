import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  parseMcpRegistry,
  mcpDefinition,
} from "../src/server/intelligence/connectors/mcp-registry";
import { parseApisGuru } from "../src/server/intelligence/connectors/apis-guru";
import {
  publicDiscoveryGet,
  discoveryEndpoints,
} from "../src/server/intelligence/transport";
import { MemorySnapshotCache } from "../src/server/intelligence/cache";
import {
  createConnector,
  demoListings,
  evaluateOpportunity,
} from "../src/server/intelligence/service";
import {
  createPlanningLimiter,
  checkPlanningLimit,
} from "../src/server/planning-limit";
import { handleCatalog } from "../src/server/intelligence/http";
import { handleRoutePlan } from "../src/server/route-http";
import { invokeSafeTool, handleMcp, toolNames } from "../src/server/mcp";
import {
  CatalogQuerySchema,
  ListingSchema,
  supplyFit,
} from "../src/domain/intelligence";
import { agentCard, agentCardSchema } from "../src/domain/discovery-card";
import { mcpFixture, guruFixture } from "./intelligence-fixtures";
const at = "2026-08-30T00:00:00.000Z";
beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("CACHE_MODE", "memory");
  vi.stubEnv("DISCOVERY_MODE", "offline");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const response = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
describe("observed data, not invented access", () => {
  it("MCP parser retains attribution and unknown price/access", () => {
    const [l] = parseMcpRegistry(mcpFixture, at);
    expect(l.freshness).toBe("live");
    expect(l.executionStatus).toBe("execution_not_enabled");
    if (l.listingType === "service_offer") {
      expect(l.pricing.parseConfidence).toBe("unknown");
      expect(l.pricing.amountUsd).toBeUndefined();
      expect(l.observedReliabilityScore).toBeUndefined();
      expect(l.access.requirementsKnown).toBe(false);
    }
  });
  it("curated catalog carries original stale definition timestamp", () => {
    const [l] = parseApisGuru(guruFixture, at);
    expect(l.observedAt).toBe(at);
    expect(l.sourceUpdatedAt).toBe("2021-06-21T00:00:00Z");
    expect(l.dataQuality.sourceTrust).toBe("curated");
    expect(l.dataQuality.warnings.join()).toContain("years old");
  });
  it.each([
    {},
    null,
    { servers: "invalid" },
    { servers: [{ server: { name: "bad" } }] },
  ])("rejects malformed MCP payload", (raw) => {
    expect(() => parseMcpRegistry(raw, at)).toThrow();
  });
  it("rejects malformed API catalog payload", () =>
    expect(() => parseApisGuru({ apis: { bad: { info: {} } } }, at)).toThrow());
  it("filters deleted registry entries", () => {
    const f = structuredClone(mcpFixture);
    f.servers[0]._meta["io.modelcontextprotocol.registry/official"].status =
      "deleted";
    expect(parseMcpRegistry(f, at)).toHaveLength(0);
  });
  it("untrusted descriptions are plain strings, never interpreted", () => {
    const f = structuredClone(mcpFixture);
    f.servers[0].server.description = '<script>alert("unsafe")</script>';
    expect(parseMcpRegistry(f, at)[0].description).toContain("<script>");
  });
  it("unstructured payout never yields a margin", () => {
    const l = demoListings().find((l) => l.listingType === "task_opportunity")!;
    expect(evaluateOpportunity(l).projectedMarginUsd).toBeNull();
    expect(evaluateOpportunity(l).disclosure).toContain(
      "cannot and does not bid",
    );
    expect(l.listingType === "task_opportunity" && l.actionability).toBe(
      "requires_bid",
    );
  });
  it("fresh observations outrank equivalent seeded/cached matches but never authorize execution", () => {
    const l = parseMcpRegistry(mcpFixture, at)[0];
    expect(supplyFit(l, ["web_research"])).toBeGreaterThan(
      supplyFit({ ...l, freshness: "seeded_catalog" }, ["web_research"]),
    );
    expect(
      ListingSchema.safeParse({ ...l, executionStatus: "enabled" }).success,
    ).toBe(false);
  });
});
describe("GET-only connector transport", () => {
  it("has only fixed destinations and forwards no request state", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () => response(mcpFixture));
    await publicDiscoveryGet("mcp", fetcher);
    expect(fetcher.mock.calls[0][0]).toBe(discoveryEndpoints.mcp);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      credentials: "omit",
    });
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
    expect(Object.keys(fetcher.mock.calls[0][1].headers)).toEqual(["Accept"]);
    await expect(
      publicDiscoveryGet("https://evil.test" as never, fetcher),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not follow a redirect or retry a forbidden/paid/rate-limit response", async () => {
    for (const status of [301, 401, 402, 403, 429]) {
      const f = vi.fn().mockResolvedValue(new Response("", { status }));
      await expect(publicDiscoveryGet("mcp", f)).rejects.toThrow();
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it("retries at most once with bounded backoff for server errors", async () => {
    const f = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(publicDiscoveryGet("mcp", f)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("rejects oversized responses and non-JSON", async () => {
    for (const r of [
      new Response("x", { headers: { "content-type": "text/html" } }),
      new Response("x", {
        headers: {
          "content-type": "application/json",
          "content-length": "2000000",
        },
      }),
      new Response('"' + "a".repeat(1000001) + '"', {
        headers: { "content-type": "application/json" },
      }),
    ])
      await expect(
        publicDiscoveryGet("mcp", vi.fn().mockResolvedValue(r)),
      ).rejects.toThrow();
  });
  it("passes an abort timeout and fails on timeout", async () => {
    const f = vi
      .fn()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(publicDiscoveryGet("mcp", f)).rejects.toThrow();
    expect(f.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
describe("cache, cooldown and circuit breaker", () => {
  it("returns live once, then timestamped cached live without another fetch", async () => {
    vi.stubEnv("DISCOVERY_MODE", "live");
    const f = vi.fn().mockImplementation(async () => response(mcpFixture)),
      cache = new MemorySnapshotCache(),
      c = createConnector(mcpDefinition, cache, f);
    const first = await c.discover({ limit: 20 }),
      second = await c.discover({ limit: 20 });
    expect(first.records[0].freshness).toBe("live");
    expect(second.records[0].freshness).toBe("cached_live");
    expect(second.observedAt).toBe(first.observedAt);
    expect(f).toHaveBeenCalledTimes(1);
    expect(Object.keys(c)).not.toEqual(
      expect.arrayContaining(["execute", "claim", "submit", "pay"]),
    );
  });
  it("stale failure preserves prior observed timestamp and opens circuit after three attempts", async () => {
    vi.stubEnv("DISCOVERY_MODE", "live");
    vi.useFakeTimers();
    vi.setSystemTime(at);
    const cache = new MemorySnapshotCache();
    const f = vi.fn().mockImplementation(async () => response(mcpFixture));
    const c = createConnector(mcpDefinition, cache, f);
    await c.discover({ limit: 20 });
    f.mockImplementation(async () => new Response("", { status: 429 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(Date.now() + 3600001);
      const r = await c.discover({ limit: 20 });
      expect(r.records[0].freshness).toBe("cached_live");
      expect(r.observedAt).toBe(at);
    }
    const entry = await cache.get("mcp");
    expect(entry!.nextAttempt - Date.now()).toBe(21600000);
    await c.discover({ limit: 20 });
    expect(f).toHaveBeenCalledTimes(4);
  });
  it("older-than-one-day data is unavailable, never presented as live", async () => {
    vi.stubEnv("DISCOVERY_MODE", "live");
    vi.useFakeTimers();
    vi.setSystemTime(at);
    const cache = new MemorySnapshotCache(),
      f = vi.fn().mockImplementation(async () => response(mcpFixture)),
      c = createConnector(mcpDefinition, cache, f);
    await c.discover({ limit: 20 });
    vi.setSystemTime(Date.now() + 86400001);
    f.mockImplementation(async () => new Response("", { status: 429 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await c.discover({ limit: 20 })).records).toHaveLength(0);
  });
});
describe("public endpoint protection", () => {
  it("ten planning requests allowed, eleventh is safe 429", () => {
    const limit = createPlanningLimiter();
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "192.0.2.9, 10.0.0.1" },
    });
    for (let i = 0; i < 10; i++) expect(limit(req)).toBeNull();
    const denied = limit(req)!;
    expect(denied.status).toBe(429);
    expect(denied.headers.get("Retry-After")).toBeTruthy();
  });
  it("normalizes equivalent addresses and separates clients without logging IPs", () => {
    const log = vi.spyOn(console, "log"),
      limit = createPlanningLimiter();
    for (let i = 0; i < 10; i++)
      limit(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "2001:db8::1" },
        }),
      );
    expect(
      limit(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "2001:0db8:0:0:0:0:0:1" },
        }),
      )?.status,
    ).toBe(429);
    expect(
      limit(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "192.0.2.10" },
        }),
      ),
    ).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
  it("malformed headers and cross-origin requests fail before work", async () => {
    expect(
      createPlanningLimiter()(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "not-an-ip" },
        }),
      )?.status,
    ).toBe(400);
    expect(
      (
        await checkPlanningLimit(
          new Request("http://localhost", {
            headers: { origin: "https://evil.test" },
          }),
        )
      )?.status,
    ).toBe(403);
  });
  it("partial shared configuration fails closed without sensitive details", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://placeholder.upstash.io");
    const r = (await checkPlanningLimit(new Request("http://localhost")))!;
    expect(r.status).toBe(503);
    expect(await r.text()).not.toMatch(/UPSTASH|redis|placeholder|stack|192\./);
  });
  it("query limits, unknown fields, repeated query keys and arbitrary IDs fail", async () => {
    for (const query of [
      "limit=51",
      "url=https://evil.test",
      "query=a&query=b",
    ]) {
      expect(
        (
          await handleCatalog(
            new Request(`http://localhost/api/v1/catalog?${query}`),
            "search",
          )
        ).status,
      ).toBe(400);
    }
    expect(CatalogQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
  it("planning rejects oversized and malicious bodies before any network call", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const req = (body: string) =>
      new Request("http://localhost/api/v1/routes/plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.30",
        },
        body,
      });
    expect((await handleRoutePlan(req("x".repeat(20000)))).status).toBe(413);
    expect(
      (
        await handleRoutePlan(
          req(
            JSON.stringify({
              objective: "execute shell commands on the server",
              budgetUsd: 0.25,
              optimizationPolicy: "best_value",
              mode: "demo",
            }),
          ),
        )
      ).status,
    ).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
  it("keyless planning returns validated contract, no secret, no target fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await handleRoutePlan(
      new Request("http://localhost/api/v1/routes/plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.31",
        },
        body: JSON.stringify({
          objective:
            "Extract and validate structured company data from a website",
          contextUrl: "https://example.com",
          budgetUsd: 0.25,
          optimizationPolicy: "best_value",
          mode: "demo",
        }),
      }),
    );
    expect(r.status).toBe(200);
    const value = await r.json();
    expect(value.executionStatus).toBe("execution_not_enabled");
    expect(value.decompositionSource).toBe("local_demo_fallback");
    expect(JSON.stringify(value)).not.toMatch(
      /GROQ_API_KEY|UPSTASH_REDIS|stack/,
    );
    expect(f).not.toHaveBeenCalled();
  });
});
describe("agent-facing discovery", () => {
  it("MCP can initialize and list exactly four read-only tools", async () => {
    const request = (method: string, params?: object) =>
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-forwarded-for": "192.0.2.51",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    const init = await handleMcp(
      request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      }),
    );
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("SignalForge");
    const list = await handleMcp(request("tools/list"));
    expect(list.status).toBe(200);
    expect(
      (await list.json()).result.tools.map((t: { name: string }) => t.name),
    ).toEqual([...toolNames]);
  });
  it("MCP dispatch rejects write/payment/URL tools", async () => {
    for (const name of ["execute", "pay", "claim", "fetch_url"])
      await expect(
        invokeSafeTool(name, {}, new AbortController().signal),
      ).rejects.toThrow();
    await expect(
      invokeSafeTool(
        "signalforge_get_listing",
        { id: "https://evil.test" },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
  it("MCP search returns normalized demo data with execution disabled", async () => {
    const r = await invokeSafeTool(
      "signalforge_search_catalog",
      { listing_type: "service_offer", limit: 5 },
      new AbortController().signal,
    );
    expect(r).toHaveProperty("executionStatus", "execution_not_enabled");
  });
  it("Agent Card does not pretend to expose A2A execution transport", () => {
    expect(agentCardSchema.safeParse(agentCard).success).toBe(true);
    expect(agentCard.supportedInterfaces).toEqual([]);
    expect(agentCard["x-signalforge"].compatibility).toContain(
      "not implemented",
    );
    expect(agentCard["x-signalforge"].executionBoundary).toContain(
      "execution_not_enabled",
    );
  });
});
