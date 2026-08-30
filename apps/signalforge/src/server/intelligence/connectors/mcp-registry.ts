import { z } from "zod";
import { CatalogServiceSchema, type Listing } from "@/domain/intelligence";
const Raw = z.object({
  servers: z
    .array(
      z.object({
        server: z.object({
          name: z.string().min(1).max(200),
          title: z.string().max(500).optional(),
          description: z.string().max(10000),
          version: z.string().max(100),
        }),
        _meta: z.object({
          "io.modelcontextprotocol.registry/official": z.object({
            status: z.enum(["active", "deprecated", "deleted"]),
            updatedAt: z.string().optional(),
            isLatest: z.boolean().optional(),
          }),
        }),
      }),
    )
    .max(30),
});
export const mcpDefinition = {
  id: "mcp",
  name: "Official MCP Registry",
  kind: "mcp_registry" as const,
  baseUrl: "https://registry.modelcontextprotocol.io",
  accessMode: "public_read_only_api" as const,
  termsUrl: "https://modelcontextprotocol.io/registry/terms-of-service",
  refreshTtlSeconds: 3600,
};
export function parseMcpRegistry(raw: unknown, observedAt: string): Listing[] {
  return Raw.parse(raw)
    .servers.filter(
      (r) =>
        r._meta["io.modelcontextprotocol.registry/official"].status ===
        "active",
    )
    .map(({ server: s, _meta }) =>
      CatalogServiceSchema.parse({
        id: `mcp:${encodeURIComponent(s.name)}`,
        sourceId: "mcp",
        sourceName: mcpDefinition.name,
        listingType: "service_offer",
        name: (s.title ?? s.name).slice(0, 160),
        description: s.description.slice(0, 1400),
        capabilities: /web search|search engine|research/i.test(s.description)
          ? ["web_research"]
          : [],
        providerType: "mcp_tool",
        pricing: { model: "unknown", parseConfidence: "unknown" },
        access: {
          actionability: "catalog_only",
          requiresApiKey: false,
          requiresWallet: false,
          requiresReputation: false,
          requirementsKnown: false,
          executionEnabled: false,
        },
        accessMode: mcpDefinition.accessMode,
        freshness: "live",
        observedAt,
        sourceUrl: `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(s.name)}/versions/latest`,
        sourceUpdatedAt:
          _meta["io.modelcontextprotocol.registry/official"].updatedAt,
        rawReference: s.version,
        executionStatus: "execution_not_enabled",
        tags: ["mcp", "publisher metadata"],
        dataQuality: {
          freshnessScore: 1,
          priceConfidence: "unknown",
          actionabilityConfidence: "unknown",
          sourceTrust: "official",
          warnings: [
            "Publisher description, not a security review or execution test. Capability tags are inferred from text.",
            "Price, credentials, wallet requirements, quality and reliability are unverified. False requirement flags mean unknown, not unnecessary.",
            "Bounded search sample, not the whole registry. No listed server is contacted.",
          ],
        },
      }),
    );
}
