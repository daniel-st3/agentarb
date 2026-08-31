import "server-only";
import { after } from "next/server";
import {
  ListingSchema,
  DiscoverySnapshotSchema,
  NetworkResponseSchema,
  CatalogQuerySchema,
  matchListing,
  compareListings,
  type ConnectorHealth,
  type DiscoverySnapshot,
  type Listing,
  type CatalogQuery,
} from "@/domain/intelligence";
import { serviceOffers } from "@/domain/service-registry";
import { publicDiscoveryGet } from "./transport";
import { mcpDefinition, parseMcpRegistry } from "./connectors/mcp-registry";
import { apisGuruDefinition, parseApisGuru } from "./connectors/apis-guru";
import { modelsDevDefinition, parseModelsDev } from "./connectors/models-dev";
import { litellmDefinition, parseLiteLlm } from "./connectors/litellm";
import { snapshotCache, type SnapshotCache } from "./cache";
import { demoDataEnabled } from "../demo-mode";
import {
  agentBountiesDefinition,
  parseAgentBounties,
} from "./connectors/agent-bounties";
export interface MarketplaceIntelligenceConnector {
  id: string;
  name: string;
  kind: ConnectorHealth["kind"];
  baseUrl: string;
  accessMode: ConnectorHealth["accessMode"];
  termsUrl?: string;
  refreshTtlSeconds: number;
  isEnabled(): Promise<boolean>;
  health(): Promise<ConnectorHealth>;
  discover(input: { limit: number }): Promise<DiscoverySnapshot>;
}
export const definitions = [
  agentBountiesDefinition,
  mcpDefinition,
  apisGuruDefinition,
  modelsDevDefinition,
  litellmDefinition,
];
const parsers = {
  agentbounties: parseAgentBounties,
  mcp: parseMcpRegistry,
  apisguru: parseApisGuru,
  modelsdev: parseModelsDev,
  litellm: parseLiteLlm,
};
export function createConnector(
  def: (typeof definitions)[number],
  cache: SnapshotCache,
  fetcher: typeof fetch = fetch,
  now = () => Date.now(),
  defer?: (job: () => Promise<void>) => void,
): MarketplaceIntelligenceConnector {
  const initial = (): ConnectorHealth => ({
    connectorId: def.id,
    name: def.name,
    kind: def.kind,
    status:
      process.env.DISCOVERY_MODE === "offline" ? "disabled" : "unavailable",
    accessMode: def.accessMode,
    enabled: process.env.DISCOVERY_MODE !== "offline",
    freshness: "unavailable",
    lastAttemptAt: null,
    cachedRecordCount: 0,
  });
  return {
    ...def,
    isEnabled: async () => process.env.DISCOVERY_MODE !== "offline",
    health: async () => {
      if (process.env.DISCOVERY_MODE === "offline") return initial();
      const c = await cache.get(def.id);
      return c?.snapshot
        ? {
            ...c.snapshot.health,
            lastAttemptAt: c.lastAttempt,
            nextRefreshAfter: new Date(c.nextAttempt).toISOString(),
            freshness: "cached_live",
            status: c.error ? "degraded" : "healthy",
          }
        : initial();
    },
    async discover(input) {
      if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50)
        throw new Error("invalid_limit");
      let entry = await cache.get(def.id);
      const time = now();
      const view = (): DiscoverySnapshot => {
        const recent =
          entry?.snapshot &&
          time - Date.parse(entry.snapshot.observedAt) <= 86400000;
        if (recent) {
          const snapshot = entry!.snapshot!;
          const age = Math.max(0, time - Date.parse(snapshot.observedAt));
          return DiscoverySnapshotSchema.parse({
            ...snapshot,
            records: snapshot.records.slice(0, input.limit).map((l) => ({
              ...l,
              freshness: "cached_live",
              dataQuality: {
                ...l.dataQuality,
                freshnessScore: Math.max(0, 1 - age / 86400000),
                warnings: [
                  ...l.dataQuality.warnings,
                  ...(entry!.error
                    ? [
                        "Source refresh failed; showing the last successful observation.",
                      ]
                    : []),
                ],
              },
            })),
            health: {
              ...snapshot.health,
              freshness: "cached_live",
              status: entry!.error ? "degraded" : "healthy",
              lastAttemptAt: entry!.lastAttempt,
              nextRefreshAfter: new Date(entry!.nextAttempt).toISOString(),
              ...(entry!.error
                ? { lastErrorCode: "upstream_unavailable" }
                : {}),
            },
          });
        }
        return {
          connectorId: def.id,
          observedAt: new Date(time).toISOString(),
          records: [],
          health: {
            ...initial(),
            lastAttemptAt: entry?.lastAttempt ?? null,
            ...(entry
              ? {
                  nextRefreshAfter: new Date(entry.nextAttempt).toISOString(),
                  lastErrorCode: "upstream_unavailable" as const,
                }
              : {}),
          },
        };
      };
      if (process.env.DISCOVERY_MODE === "offline")
        return {
          connectorId: def.id,
          observedAt: new Date(time).toISOString(),
          records: [],
          health: { ...initial(), enabled: false, status: "disabled" },
        };
      if (entry && entry.nextAttempt > time) return view();
      // A shared lease prevents a thundering herd. No public force-refresh path.
      if (!(await cache.lease(def.id, def.refreshTtlSeconds))) return view();
      const attempt = new Date(time).toISOString();
      const refresh = async (): Promise<DiscoverySnapshot> => {
        try {
          const metadata: {
            etag?: string;
            lastModified?: string;
            notModified?: boolean;
          } = {};
          const raw = await publicDiscoveryGet(
            def.id as keyof typeof parsers,
            fetcher,
            entry ?? undefined,
            metadata,
          );
          if (metadata.notModified) {
            if (!entry?.snapshot) throw new Error("invalid_payload");
            entry = {
              ...entry,
              failures: 0,
              error: false,
              lastAttempt: attempt,
              lastValidatedAt: attempt,
              nextAttempt: time + def.refreshTtlSeconds * 1000,
            };
            await cache.set(def.id, entry);
            return view();
          }
          const records = parsers[def.id as keyof typeof parsers](raw, attempt);
          const snapshot = DiscoverySnapshotSchema.parse({
            connectorId: def.id,
            observedAt: attempt,
            records,
            health: {
              ...initial(),
              status: "healthy",
              freshness: "live",
              lastAttemptAt: attempt,
              lastSuccessAt: attempt,
              cachedRecordCount: records.length,
              nextRefreshAfter: new Date(
                time + def.refreshTtlSeconds * 1000,
              ).toISOString(),
            },
          });
          await cache.set(def.id, {
            ...(metadata.etag ? { etag: metadata.etag } : {}),
            ...(metadata.lastModified
              ? { lastModified: metadata.lastModified }
              : {}),
            lastValidatedAt: attempt,
            snapshot,
            failures: 0,
            nextAttempt: time + def.refreshTtlSeconds * 1000,
            lastAttempt: attempt,
            error: false,
          });
          return { ...snapshot, records: records.slice(0, input.limit) };
        } catch {
          const failures = (entry?.failures ?? 0) + 1;
          entry = {
            ...entry,
            failures,
            nextAttempt:
              time +
              (failures >= 3 ? 6 * 3600000 : def.refreshTtlSeconds * 1000),
            lastAttempt: attempt,
            error: true,
          };
          await cache.set(def.id, entry);
          console.warn("connector_discovery", {
            connectorId: def.id,
            errorCategory: "upstream_unavailable",
          });
          return view();
        }
      };
      // Last-good data retains its observation time; refresh survives a serverless response.
      if (
        defer &&
        entry?.snapshot &&
        time - Date.parse(entry.snapshot.observedAt) <= 86400000
      ) {
        defer(async () => {
          await refresh();
        });
        return view();
      }
      return refresh();
    },
  };
}
export function demoListings(): Listing[] {
  const observedAt = "2026-08-30T00:00:00.000Z",
    quality = {
      freshnessScore: 0,
      priceConfidence: "estimated",
      actionabilityConfidence: "inferred",
      sourceTrust: "simulated",
      warnings: [
        "Authored demonstration, not a live observation. Modeled traits are not measured vendor performance.",
      ],
    };
  const services = serviceOffers
    .filter((o) => o.providerType === "mock")
    .map((o) =>
      ListingSchema.parse({
        id: `demo:${o.providerId}`,
        sourceId: "demo",
        sourceName: "Controlled service fixtures",
        listingType: "service_offer",
        name: o.name,
        description:
          "Simulated service traits used to compare deterministic capability routes.",
        capabilities: o.capabilities,
        providerType: "other",
        pricing: {
          model: o.pricePerCallUsd ? "per_call" : "free",
          amountUsd: o.pricePerCallUsd,
          currency: "USD",
          parseConfidence: "estimated",
        },
        estimatedLatencySeconds: o.estimatedLatencySeconds,
        access: {
          actionability: "execution_not_enabled",
          requiresApiKey: false,
          requiresWallet: false,
          requiresReputation: false,
          requirementsKnown: true,
          executionEnabled: false,
        },
        accessMode: "manual_seed",
        freshness: "simulated_demo",
        observedAt,
        sourceUrl: "https://signalforge-rose-two.vercel.app/developers",
        executionStatus: "execution_not_enabled",
        tags: ["demo"],
        dataQuality: quality,
      }),
    );
  const task = ListingSchema.parse({
    id: "demo:opportunity-1",
    sourceId: "demo",
    sourceName: "Controlled task fixture",
    listingType: "task_opportunity",
    title: "Structure a public company profile",
    description:
      "Fictional opportunity demonstrating bid/review constraints. Not a real listing.",
    requiredCapabilities: ["url_extract", "data_extract"],
    payout: {
      rawPayoutText: "Budget negotiable after review",
      parseConfidence: "unstructured",
    },
    claimModel: "bid_and_selection",
    settlement: "unknown",
    actionability: "requires_bid",
    constraints: [
      "Fictional task; no marketplace exists for this record.",
      "Evaluation only; execution is disabled.",
    ],
    accessMode: "manual_seed",
    freshness: "simulated_demo",
    observedAt,
    sourceUrl: "https://signalforge-rose-two.vercel.app/developers",
    executionStatus: "execution_not_enabled",
    dataQuality: { ...quality, priceConfidence: "unstructured" },
  });
  return [...services, task];
}
export async function networkSnapshot() {
  const cache = snapshotCache();
  const snapshots = await Promise.all(
    definitions.map((d) =>
      createConnector(
        d,
        cache,
        fetch,
        () => Date.now(),
        (job) => after(job),
      ).discover({ limit: 50 }),
    ),
  );
  return NetworkResponseSchema.parse({
    version: "1.0",
    records: [
      ...snapshots.flatMap((s) => s.records),
      ...(demoDataEnabled() ? demoListings() : []),
    ],
    sources: snapshots.map((s) => s.health),
    cacheMode: cache.mode,
    warnings: [
      "Discovery only. No listed service or task is executable through SignalForge.",
      "Catalog samples are bounded, not exhaustive. Live means the catalog was observed now, not that underlying services were tested.",
      ...(cache.mode === "non_durable_demo"
        ? [
            "Non-durable demo cache and per-instance refresh control. Cold starts may refetch; configure a shared store for production aggregation.",
          ]
        : []),
    ],
    executionStatus: "execution_not_enabled",
  });
}
export async function searchCatalog(raw: CatalogQuery) {
  const q = CatalogQuerySchema.parse(raw),
    network = await networkSnapshot();
  const matches = network.records
    .filter((l) => matchListing(l, q))
    .sort((a, b) => compareListings(a, b, q));
  return {
    ...network,
    records: matches.slice(0, q.limit),
    matchedCount: matches.length,
    truncated: matches.length > q.limit,
  };
}
export async function getListing(id: string) {
  return (await networkSnapshot()).records.find((l) => l.id === id);
}
export function evaluateOpportunity(listing: Listing) {
  if (listing.listingType !== "task_opportunity")
    throw new Error("not_opportunity");
  return {
    opportunityId: listing.id,
    projectedMarginUsd: null,
    assumptions: [
      "No defensible task-specific execution cost or calibrated success probability is available.",
      `Payout confidence: ${listing.payout.parseConfidence}; source state: ${listing.freshness}.`,
    ],
    reason:
      "Projected margin unavailable: payout or execution cost is not structured enough for a defensible estimate.",
    executionStatus: "execution_not_enabled" as const,
    disclosure:
      "Evaluation only. SignalForge cannot and does not bid, claim, accept, submit, or settle this opportunity.",
  };
}
