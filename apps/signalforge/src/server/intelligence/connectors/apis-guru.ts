import { z } from "zod";
import { CatalogServiceSchema, type Listing } from "@/domain/intelligence";
const Raw = z.object({
  apis: z
    .record(
      z.string().max(180),
      z.object({
        info: z.object({
          title: z.string().max(500),
          description: z.string().max(20000).optional(),
          version: z.string().max(100).optional(),
        }),
        updated: z.string().max(60).optional(),
      }),
    )
    .refine((o) => Object.keys(o).length <= 50),
});
export const apisGuruDefinition = {
  id: "apisguru",
  name: "APIs.guru · NYT catalog",
  kind: "service_catalog" as const,
  baseUrl: "https://api.apis.guru",
  accessMode: "official_catalog" as const,
  termsUrl: "https://github.com/APIs-guru/openapi-directory#licenses",
  refreshTtlSeconds: 3600,
};
export function parseApisGuru(raw: unknown, observedAt: string): Listing[] {
  return Object.entries(Raw.parse(raw).apis).map(([id, v]) =>
    CatalogServiceSchema.parse({
      id: `apisguru:${id}`,
      sourceId: "apisguru",
      sourceName: apisGuruDefinition.name,
      listingType: "service_offer",
      name: v.info.title.slice(0, 160),
      description: (v.info.description ?? "API definition catalog entry.")
        .replace(/<[^>]*>/g, " ")
        .slice(0, 1400),
      capabilities: /article|news|archive|stories/i.test(v.info.title)
        ? ["news_search"]
        : [],
      providerType: "api",
      pricing: { model: "unknown", parseConfidence: "unknown" },
      access: {
        actionability: "catalog_only",
        requiresApiKey: false,
        requiresWallet: false,
        requiresReputation: false,
        requirementsKnown: false,
        executionEnabled: false,
      },
      accessMode: apisGuruDefinition.accessMode,
      freshness: "live",
      observedAt,
      sourceUrl: "https://api.apis.guru/v2/nytimes.com.json",
      sourceUpdatedAt: v.updated,
      rawReference: id,
      executionStatus: "execution_not_enabled",
      tags: ["OpenAPI", "curated catalog"],
      dataQuality: {
        freshnessScore: 1,
        priceConfidence: "unknown",
        actionabilityConfidence: "unknown",
        sourceTrust: "curated",
        warnings: [
          "Live observation of a curated catalog, not a live NYT service test. Underlying definitions may be years old.",
          "Capability tags are inferred; access requirements and price are unknown. No article content or target API is fetched.",
        ],
      },
    }),
  );
}
