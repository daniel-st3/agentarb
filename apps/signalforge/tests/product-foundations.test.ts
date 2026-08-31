import { it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { commandPreview } from "../src/domain/command-preview";
import { storeConfig } from "../src/server/store-config";
import { parseModelsDev } from "../src/server/intelligence/connectors/models-dev";
import { parseLiteLlm } from "../src/server/intelligence/connectors/litellm";
import {
  publicDiscoveryGet,
  discoveryEndpoints,
} from "../src/server/intelligence/transport";
import {
  CatalogQuerySchema,
  matchListing,
  NetworkStatusSchema,
  compareListings,
} from "../src/domain/intelligence";
import {
  createConnector,
  demoListings,
} from "../src/server/intelligence/service";
import { mcpDefinition } from "../src/server/intelligence/connectors/mcp-registry";
import { MemorySnapshotCache } from "../src/server/intelligence/cache";
import { candidateSources } from "../src/server/intelligence/connectors/candidates";
import { mcpFixture } from "./intelligence-fixtures";
const at = "2026-08-30T00:00:00.000Z";
const models = {
  groq: {
    name: "Groq",
    models: {
      fixture: {
        id: "fixture",
        name: "Authored model fixture",
        modalities: { input: ["text"], output: ["text"] },
        cost: { input: 0.1, output: 0.2 },
      },
    },
  },
};
const lite = {
  "mistral/fixture": {
    litellm_provider: "mistral",
    mode: "chat",
    input_cost_per_token: 0.000001,
    output_cost_per_token: 0.000002,
  },
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it.each([
  ["Build a due diligence route for a startup", "due diligence"],
  ["Parse a long public document into structured data", "document extraction"],
  ["Design daily monitoring of competitor pricing changes", "monitoring"],
  ["Compare company competitors in a market", "competitive intelligence"],
  ["Enrich structured company data from this website", "data enrichment"],
  ["Plan a general task for an agent", "general agent task"],
])("local preview aligns with deterministic classification: %s", (q, type) => {
  expect(commandPreview(q).type).toBe(type);
});
it("URL presence informs preview without fetching it", () => {
  expect(
    commandPreview("Investigate this public subject", "https://example.com")
      .type,
  ).toBe("company analysis");
  expect(commandPreview("curl https://example.com").type).toBe(
    "general objective",
  );
});
it("memory/auto demo works without credentials; durable never silently downgrades", () => {
  expect(storeConfig({ CACHE_MODE: "auto" })).toBeNull();
  expect(storeConfig({ CACHE_MODE: "memory" })).toBeNull();
  expect(() => storeConfig({ CACHE_MODE: "durable" })).toThrow();
  expect(() => storeConfig({ CACHE_MODE: "invalid" })).toThrow();
});
it("Vercel KV aliases use the same durable adapter without exposing configuration", () => {
  expect(
    storeConfig({
      CACHE_MODE: "durable",
      KV_REST_API_URL: "https://fixture.upstash.io",
      KV_REST_API_TOKEN: "test-placeholder",
    }),
  ).toEqual({ url: "https://fixture.upstash.io", token: "test-placeholder" });
  expect(() =>
    storeConfig({
      CACHE_MODE: "memory",
      KV_REST_API_URL: "https://fixture.upstash.io",
    }),
  ).toThrow("store_unavailable");
});
it.each([
  "http://fixture.upstash.io",
  "https://other.test",
  "https://fixture.upstash.io/?secret=x",
  "https://user:pass@fixture.upstash.io",
  "https://fixture.upstash.io:8443",
])("reject unsafe store URL %s", (url) => {
  expect(() =>
    storeConfig({
      UPSTASH_REDIS_REST_URL: url,
      UPSTASH_REDIS_REST_TOKEN: "test-placeholder",
    }),
  ).toThrow();
});
it("new catalogs preserve token units, attribution and uncertainty, never per-task cost", () => {
  for (const l of [...parseModelsDev(models, at), ...parseLiteLlm(lite, at)]) {
    expect(l.executionStatus).toBe("execution_not_enabled");
    expect(l.observedAt).toBe(at);
    expect(l.termsUrl).toMatch(/^https:/);
    expect(l.dataQuality.sourceTrust).toBe("curated");
    if (l.listingType === "service_offer") {
      expect(l.pricing.model).toBe("per_token");
      expect(l.pricing.parseConfidence).toBe("estimated");
      expect(l.pricing.amountUsd).toBeUndefined();
      expect(l.access.executionEnabled).toBe(false);
      expect(
        matchListing(l, CatalogQuerySchema.parse({ maxPriceUsd: 10 })),
      ).toBe(false);
    }
  }
});
it("source payloads and numeric cost fields are validated before normalization", () => {
  expect(() => parseModelsDev({ groq: { models: "bad" } }, at)).toThrow();
  expect(() =>
    parseLiteLlm(
      {
        "mistral/bad": {
          litellm_provider: "mistral",
          mode: "chat",
          input_cost_per_token: -1,
        },
      },
      at,
    ),
  ).toThrow();
  const broken = structuredClone(models);
  broken.groq.models.fixture.cost.input = NaN;
  expect(() => parseModelsDev(broken, at)).toThrow();
});
it("deprecated and unsupported modality entries cannot imply availability", () => {
  expect(
    parseLiteLlm(
      {
        "mistral/old": {
          ...lite["mistral/fixture"],
          deprecation_date: "2025-01-01",
        },
      },
      at,
    ),
  ).toEqual([]);
  const audio = structuredClone(models);
  audio.groq.models.fixture.modalities.input = ["audio"];
  expect(parseModelsDev(audio, at)).toEqual([]);
});
it.each(["modelsdev", "litellm"] as const)(
  "new %s connector fetches only its fixed public GET",
  async (source) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", {
          headers: {
            "content-type":
              source === "litellm" ? "text/plain" : "application/json",
          },
        }),
      );
    await publicDiscoveryGet(source, fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      discoveryEndpoints[source],
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        credentials: "omit",
        headers: { Accept: "application/json" },
      }),
    );
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
    expect(Object.keys(discoveryEndpoints)).toEqual([
      "agentbounties",
      "agentbountiesState",
      "mcp",
      "apisguru",
      "modelsdev",
      "litellm",
    ]);
  },
);
it("stale-while-revalidate serves timestamped last-good data before deferred refresh", async () => {
  vi.stubEnv("DISCOVERY_MODE", "live");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
  const cache = new MemorySnapshotCache();
  const fetcher = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify(mcpFixture), {
          headers: { "content-type": "application/json" },
        }),
    );
  const jobs: Array<() => Promise<void>> = [];
  const connector = createConnector(
    mcpDefinition,
    cache,
    fetcher,
    () => Date.now(),
    (job) => jobs.push(job),
  );
  const first = await connector.discover({ limit: 10 });
  vi.setSystemTime(new Date(Date.parse(at) + 3601000));
  const stale = await connector.discover({ limit: 10 });
  expect(stale.records[0].freshness).toBe("cached_live");
  expect(stale.observedAt).toBe(first.observedAt);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(jobs).toHaveLength(1);
  await jobs[0]();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await cache.get("mcp"))?.snapshot?.observedAt).not.toBe(
    first.observedAt,
  );
});
it("search includes source and capability names; unknown prices do not rank as zero", () => {
  const [l] = parseModelsDev(models, at);
  expect(
    matchListing(l, CatalogQuerySchema.parse({ query: "models.dev" })),
  ).toBe(true);
  expect(
    matchListing(l, CatalogQuerySchema.parse({ query: "synthesis" })),
  ).toBe(true);
  expect(
    matchListing(l, CatalogQuerySchema.parse({ availability: "demo" })),
  ).toBe(false);
  const demo = demoListings()[0];
  expect(
    compareListings(
      l,
      demo,
      CatalogQuerySchema.parse({ sort: "structured_price" }),
    ),
  ).toBe(l.id.localeCompare(demo.id));
});
it("unsafe query fields fail closed and disabled candidates have no network methods", () => {
  expect(
    CatalogQuerySchema.safeParse({ url: "https://other.test" }).success,
  ).toBe(false);
  expect(CatalogQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  expect(CatalogQuerySchema.safeParse({ sort: "profit" }).success).toBe(false);
  expect(candidateSources.find((c) => c.id === "openrouter")).toBeTruthy();
  for (const c of candidateSources) expect(c).not.toHaveProperty("discover");
});
it("aggregate status cannot include credentials or raw snapshots", () => {
  const good = {
    version: "1.0",
    sources: [],
    cacheMode: "non_durable_demo",
    warnings: [],
    executionStatus: "execution_not_enabled",
    observedCount: 0,
    observedCapabilities: [],
    rateLimitMode: "best_effort",
  };
  expect(NetworkStatusSchema.safeParse(good).success).toBe(true);
  expect(
    NetworkStatusSchema.safeParse({ ...good, token: "test-placeholder" })
      .success,
  ).toBe(false);
});
