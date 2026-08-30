import { z } from "zod";
import { CatalogServiceSchema, type Listing } from "@/domain/intelligence";
const Raw = z
  .record(z.string().max(300), z.unknown())
  .refine((v) => Object.keys(v).length <= 10000);
const Entry = z.object({
  litellm_provider: z.literal("mistral"),
  mode: z.literal("chat"),
  input_cost_per_token: z.number().finite().nonnegative().optional(),
  output_cost_per_token: z.number().finite().nonnegative().optional(),
  deprecation_date: z.string().max(60).optional(),
});
export const litellmDefinition = {
  id: "litellm",
  name: "LiteLLM · Mistral model catalog",
  kind: "service_catalog" as const,
  baseUrl: "https://raw.githubusercontent.com",
  accessMode: "official_feed" as const,
  termsUrl: "https://github.com/BerriAI/litellm/blob/main/LICENSE",
  refreshTtlSeconds: 21600,
};
export function parseLiteLlm(raw: unknown, observedAt: string): Listing[] {
  return Object.entries(Raw.parse(raw))
    .filter(
      ([, v]) =>
        v &&
        typeof v === "object" &&
        "litellm_provider" in v &&
        v.litellm_provider === "mistral" &&
        "mode" in v &&
        v.mode === "chat",
    )
    .map(([id, v]) => ({ id, ...Entry.parse(v) }))
    .filter(
      (v) =>
        !v.deprecation_date || v.deprecation_date > observedAt.slice(0, 10),
    )
    .slice(0, 25)
    .map((v) => {
      const priced =
        v.input_cost_per_token !== undefined &&
        v.output_cost_per_token !== undefined;
      return CatalogServiceSchema.parse({
        id: "litellm:" + v.id,
        sourceId: "litellm",
        sourceName: litellmDefinition.name,
        listingType: "service_offer",
        name: v.id.slice(0, 160),
        description:
          "Community-maintained chat model metadata from LiteLLM’s published cost map. Not a provider availability test.",
        capabilities: ["synthesis"],
        providerType: "api",
        pricing: {
          model: priced ? "per_token" : "unknown",
          parseConfidence: priced ? "estimated" : "unknown",
          rawPriceText: priced
            ? `Catalog USD per token: input ${v.input_cost_per_token}; output ${v.output_cost_per_token}. Not a task quote.`
            : "No complete catalog price.",
        },
        access: {
          actionability: "catalog_only",
          requiresApiKey: true,
          requiresWallet: false,
          requiresReputation: false,
          requirementsKnown: false,
          executionEnabled: false,
        },
        accessMode: litellmDefinition.accessMode,
        freshness: "live",
        observedAt,
        sourceUrl:
          "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
        termsUrl: litellmDefinition.termsUrl,
        rawReference: v.id,
        executionStatus: "execution_not_enabled",
        tags: ["model catalog", "Mistral", "chat"],
        dataQuality: {
          freshnessScore: 1,
          priceConfidence: priced ? "estimated" : "unknown",
          actionabilityConfidence: "unknown",
          sourceTrust: "curated",
          warnings: [
            "MIT-licensed catalog metadata, not a live inference result. Underlying pricing may lag; no measured reliability or per-task cost is available.",
            "Synthesis is inferred from chat mode. Multiple catalog entries do not establish independent evidence or verified service availability.",
          ],
        },
      });
    });
}
