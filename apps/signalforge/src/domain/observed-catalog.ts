import { z } from "zod";
import { CatalogServiceSchema, supplyFit, type Listing } from "./intelligence";
import { capabilityIds, type CapabilityId } from "./objective";

/** Discovery context only. Never a selected/fallback execution-step provider. */
export const ObservedCatalogOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sourceId: z.string(),
    sourceName: z.string(),
    freshness: z.enum(["live", "cached_live"]),
    observedAt: z.string().datetime(),
    sourceUrl: CatalogServiceSchema.shape.sourceUrl,
    accessMode: CatalogServiceSchema.shape.accessMode,
    actionability: CatalogServiceSchema.shape.access.shape.actionability,
    capabilities: z.array(z.enum(capabilityIds)),
    pricing: CatalogServiceSchema.shape.pricing,
    selectionStatus: z.literal("discovery_only_not_selected"),
    label: z.literal("Observed Catalog Option"),
    boundaryLabel: z.literal("NOT CALLED / NOT PAID / EXECUTION DISABLED"),
    servicesCalled: z.literal(false),
    paymentsMade: z.literal(false),
    executionStatus: z.literal("execution_not_enabled"),
    reason: z.string(),
  })
  .strict();

export function observedCatalogOptions(
  records: Listing[],
  required: CapabilityId[],
  now = Date.now(),
) {
  return records
    .flatMap((record) => {
      const parsed = CatalogServiceSchema.safeParse(record);
      if (!parsed.success) return [];
      const l = parsed.data;
      const age = now - Date.parse(l.observedAt);
      if (
        !["live", "cached_live"].includes(l.freshness) ||
        !["official", "curated"].includes(l.dataQuality.sourceTrust) ||
        ["manual_seed", "unsupported"].includes(l.accessMode) ||
        age < 0 ||
        age > 86400000 ||
        l.dataQuality.freshnessScore <= 0 ||
        !l.capabilities.some((c) => required.includes(c))
      )
        return [];
      return [l];
    })
    .sort(
      (a, b) =>
        supplyFit(b, required) - supplyFit(a, required) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 8)
    .map((l) =>
      ObservedCatalogOptionSchema.parse({
        id: l.id,
        name: l.name,
        sourceId: l.sourceId,
        sourceName: l.sourceName,
        freshness: l.freshness,
        observedAt: l.observedAt,
        sourceUrl: l.sourceUrl,
        accessMode: l.accessMode,
        actionability: l.access.actionability,
        capabilities: l.capabilities,
        pricing: l.pricing,
        selectionStatus: "discovery_only_not_selected",
        label: "Observed Catalog Option",
        boundaryLabel: "NOT CALLED / NOT PAID / EXECUTION DISABLED",
        servicesCalled: false,
        paymentsMade: false,
        executionStatus: "execution_not_enabled",
        reason:
          "Capability-matched catalog metadata only. Not an executable or fallback route step. Access, reliability and per-task cost have not been established. Catalog price units are not a task quote.",
      }),
    );
}
