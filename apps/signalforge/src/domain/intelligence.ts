import { z } from "zod";
import { capabilityIds } from "./objective";
export const FreshnessSchema = z.enum([
  "live",
  "cached_live",
  "seeded_catalog",
  "simulated_demo",
  "unavailable",
  "error",
]);
export const AccessModeSchema = z.enum([
  "public_read_only_api",
  "official_catalog",
  "official_feed",
  "manual_seed",
  "unsupported",
]);
export const ActionabilitySchema = z.enum([
  "catalog_only",
  "discovery_only",
  "requires_bid",
  "requires_human_selection",
  "open_claim_observed",
  "unknown",
  "execution_not_enabled",
]);
const confidence = z.enum(["exact", "estimated", "unstructured", "unknown"]);
const safeUrl = z
  .string()
  .max(1000)
  .url()
  .refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  });
export const DataQualitySchema = z
  .object({
    freshnessScore: z.number().min(0).max(1),
    priceConfidence: confidence,
    actionabilityConfidence: z.enum(["observed", "inferred", "unknown"]),
    sourceTrust: z.enum(["official", "curated", "seeded", "simulated"]),
    warnings: z.array(z.string().max(500)).max(12),
  })
  .strict();
const common = {
  id: z.string().max(240),
  sourceId: z.string().max(60),
  sourceName: z.string().max(120),
  accessMode: AccessModeSchema,
  freshness: FreshnessSchema,
  observedAt: z.string().datetime(),
  sourceUrl: safeUrl,
  rawReference: z.string().max(240).optional(),
  sourceUpdatedAt: z.string().max(60).optional(),
  executionStatus: z.literal("execution_not_enabled"),
  dataQuality: DataQualitySchema,
};
const amount = {
  amountUsd: z.number().finite().nonnegative().optional(),
  currency: z.string().max(20).optional(),
  parseConfidence: confidence,
};
export const CatalogServiceSchema = z
  .object({
    ...common,
    listingType: z.literal("service_offer"),
    name: z.string().max(160),
    description: z.string().max(1400),
    capabilities: z.array(z.enum(capabilityIds)).max(9),
    providerType: z.enum([
      "api",
      "agent",
      "mcp_tool",
      "a2a_agent",
      "x402_service",
      "other",
    ]),
    pricing: z
      .object({
        ...amount,
        model: z.enum([
          "free",
          "per_call",
          "per_token",
          "subscription",
          "quote_required",
          "unknown",
        ]),
        rawPriceText: z.string().max(300).optional(),
      })
      .strict(),
    estimatedLatencySeconds: z.number().nonnegative().optional(),
    observedReliabilityScore: z.number().min(0).max(1).optional(),
    qualityScore: z.number().min(0).max(1).optional(),
    access: z
      .object({
        actionability: ActionabilitySchema,
        requiresApiKey: z.boolean(),
        requiresWallet: z.boolean(),
        requiresReputation: z.boolean(),
        requirementsKnown: z.boolean(),
        executionEnabled: z.literal(false),
      })
      .strict(),
    tags: z.array(z.string().max(60)).max(12),
  })
  .strict();
export const TaskOpportunitySchema = z
  .object({
    ...common,
    listingType: z.literal("task_opportunity"),
    title: z.string().max(160),
    description: z.string().max(1400),
    requiredCapabilities: z.array(z.enum(capabilityIds)).max(9),
    payout: z
      .object({ ...amount, rawPayoutText: z.string().max(300).optional() })
      .strict(),
    deadline: z.string().max(100).optional(),
    claimModel: z.enum([
      "open_claim",
      "bid_and_selection",
      "buyer_selects",
      "auction",
      "unknown",
    ]),
    settlement: z.enum(["onchain", "off_platform", "escrow", "unknown"]),
    reputationRequirement: z.string().max(300).optional(),
    actionability: ActionabilitySchema,
    constraints: z.array(z.string().max(400)).max(12),
  })
  .strict();
export const ListingSchema = z.discriminatedUnion("listingType", [
  CatalogServiceSchema,
  TaskOpportunitySchema,
]);
export type Listing = z.infer<typeof ListingSchema>;
export type CatalogService = z.infer<typeof CatalogServiceSchema>;
export type TaskOpportunity = z.infer<typeof TaskOpportunitySchema>;
export const ConnectorHealthSchema = z
  .object({
    connectorId: z.string(),
    name: z.string(),
    kind: z.enum([
      "service_catalog",
      "task_marketplace",
      "agent_registry",
      "mcp_registry",
    ]),
    status: z.enum(["healthy", "degraded", "unavailable", "disabled"]),
    accessMode: AccessModeSchema,
    enabled: z.boolean(),
    freshness: FreshnessSchema,
    lastAttemptAt: z.string().datetime().nullable(),
    lastSuccessAt: z.string().datetime().optional(),
    lastErrorCode: z
      .enum([
        "upstream_unavailable",
        "invalid_payload",
        "refresh_paused",
        "cache_unavailable",
      ])
      .optional(),
    cachedRecordCount: z.number().int().nonnegative(),
    nextRefreshAfter: z.string().datetime().optional(),
  })
  .strict();
export type ConnectorHealth = z.infer<typeof ConnectorHealthSchema>;
export const DiscoverySnapshotSchema = z
  .object({
    connectorId: z.string(),
    observedAt: z.string().datetime(),
    records: z.array(ListingSchema).max(100),
    health: ConnectorHealthSchema,
  })
  .strict();
export type DiscoverySnapshot = z.infer<typeof DiscoverySnapshotSchema>;
export const CatalogQuerySchema = z
  .object({
    capability: z.enum(capabilityIds).optional(),
    source: z
      .string()
      .regex(/^[a-z0-9-]{1,60}$/)
      .optional(),
    listingType: z.enum(["service_offer", "task_opportunity"]).optional(),
    freshness: FreshnessSchema.optional(),
    actionability: ActionabilitySchema.optional(),
    priceModel: z
      .enum([
        "free",
        "per_call",
        "per_token",
        "subscription",
        "quote_required",
        "unknown",
      ])
      .optional(),
    maxPriceUsd: z.coerce.number().finite().min(0).max(10000).optional(),
    query: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;
export const NetworkResponseSchema = z
  .object({
    version: z.literal("1.0"),
    records: z.array(ListingSchema).max(100),
    sources: z.array(ConnectorHealthSchema),
    cacheMode: z.enum(["shared", "non_durable_demo"]),
    warnings: z.array(z.string()),
    executionStatus: z.literal("execution_not_enabled"),
  })
  .strict();
export type NetworkResponse = z.infer<typeof NetworkResponseSchema>;
export function matchListing(l: Listing, q: CatalogQuery) {
  const caps =
    l.listingType === "service_offer" ? l.capabilities : l.requiredCapabilities;
  const price = l.listingType === "service_offer" ? l.pricing : l.payout;
  const action =
    l.listingType === "service_offer"
      ? l.access.actionability
      : l.actionability;
  return (
    (!q.capability || caps.includes(q.capability)) &&
    (!q.source || q.source === l.sourceId) &&
    (!q.listingType || q.listingType === l.listingType) &&
    (!q.freshness || q.freshness === l.freshness) &&
    (!q.actionability || q.actionability === action) &&
    (!q.priceModel ||
      (l.listingType === "service_offer" &&
        q.priceModel === l.pricing.model)) &&
    (q.maxPriceUsd === undefined ||
      (l.listingType === "service_offer" &&
        price.parseConfidence === "exact" &&
        price.amountUsd !== undefined &&
        price.amountUsd <= q.maxPriceUsd)) &&
    (!q.query ||
      JSON.stringify(
        l.listingType === "service_offer"
          ? [l.name, l.description, l.tags]
          : [l.title, l.description],
      )
        .toLowerCase()
        .includes(q.query.toLowerCase()))
  );
}
/** Supply ranking is discovery fit, never execution authorization or profitability. */
export function supplyFit(l: Listing, capabilities: string[]): number {
  const caps =
    l.listingType === "service_offer" ? l.capabilities : l.requiredCapabilities;
  const price = l.listingType === "service_offer" ? l.pricing : l.payout;
  return (
    caps.filter((c) => capabilities.includes(c)).length * 10 +
    {
      live: 4,
      cached_live: 2,
      seeded_catalog: 1,
      simulated_demo: 0,
      unavailable: -10,
      error: -10,
    }[l.freshness] +
    (price.parseConfidence === "exact" ? 1 : -1) +
    l.dataQuality.freshnessScore
  );
}
