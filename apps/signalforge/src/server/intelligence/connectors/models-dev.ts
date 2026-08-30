import { z } from "zod";
import { CatalogServiceSchema, type Listing } from "@/domain/intelligence";
const Model = z.object({
  id: z.string().max(180),
  name: z.string().max(300),
  description: z.string().max(20000).optional(),
  last_updated: z.string().max(60).optional(),
  modalities: z.object({
    input: z.array(z.string()),
    output: z.array(z.string()),
  }),
  cost: z
    .object({
      input: z.number().finite().nonnegative(),
      output: z.number().finite().nonnegative(),
    })
    .optional(),
  status: z.string().optional(),
});
// Bounded, explicit provider sample, not an unrestricted catalog proxy.
const Raw = z.object({
  groq: z.object({
    name: z.string().max(100),
    models: z
      .record(z.string(), Model)
      .refine((v) => Object.keys(v).length <= 100),
  }),
});
export const modelsDevDefinition = {
  id: "modelsdev",
  name: "Models.dev · Groq model catalog",
  kind: "service_catalog" as const,
  baseUrl: "https://models.dev",
  accessMode: "official_catalog" as const,
  termsUrl: "https://github.com/anomalyco/models.dev/blob/dev/LICENSE",
  refreshTtlSeconds: 21600,
};
export function parseModelsDev(raw: unknown, observedAt: string): Listing[] {
  return Object.values(Raw.parse(raw).groq.models)
    .filter(
      (m) =>
        m.modalities.input.includes("text") &&
        m.modalities.output.includes("text") &&
        m.status !== "deprecated",
    )
    .slice(0, 30)
    .map((m) =>
      CatalogServiceSchema.parse({
        id: "modelsdev:" + m.id,
        sourceId: "modelsdev",
        sourceName: modelsDevDefinition.name,
        listingType: "service_offer",
        name: m.name.slice(0, 160),
        description: (
          m.description ?? "Community-maintained model catalog metadata."
        ).slice(0, 1400),
        capabilities: ["synthesis"],
        providerType: "api",
        pricing: {
          model: m.cost ? "per_token" : "unknown",
          parseConfidence: m.cost ? "estimated" : "unknown",
          rawPriceText: m.cost
            ? `Catalog USD per million tokens: input ${m.cost.input}; output ${m.cost.output}. Not a per-task quote.`
            : "No catalog price provided.",
        },
        access: {
          actionability: "catalog_only",
          requiresApiKey: true,
          requiresWallet: false,
          requiresReputation: false,
          requirementsKnown: false,
          executionEnabled: false,
        },
        accessMode: modelsDevDefinition.accessMode,
        freshness: "live",
        observedAt,
        sourceUrl: "https://models.dev/api.json",
        termsUrl: modelsDevDefinition.termsUrl,
        sourceUpdatedAt: m.last_updated,
        rawReference: m.id,
        executionStatus: "execution_not_enabled",
        tags: ["model catalog", "Groq", "text output"],
        dataQuality: {
          freshnessScore: 1,
          priceConfidence: m.cost ? "estimated" : "unknown",
          actionabilityConfidence: "unknown",
          sourceTrust: "curated",
          warnings: [
            "Live catalog observation, not a provider call or measured performance. Models.dev is community-maintained (MIT).",
            "Synthesis capability is inferred from text modalities. Token prices are not per-call costs and cannot establish route affordability.",
          ],
        },
      }),
    );
}
