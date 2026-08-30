import type { CapabilityId } from "./objective";

export interface ServiceOffer {
  providerId: string;
  name: string;
  capabilities: CapabilityId[];
  providerType: "mock" | "public_web" | "x402_catalog_only";
  pricePerCallUsd: number;
  estimatedLatencySeconds: number;
  reliabilityScore: number;
  qualityScore: number;
  requiresApiKey: boolean;
  isEnabled: boolean;
  independentVerification: boolean;
  sourceGroup: string;
}
export interface ProviderRequest {
  objective: string;
  capability: CapabilityId;
}
export interface ProviderResult {
  isSimulated: true;
  actualCostUsd: 0;
  note: string;
}
/** Future adapters must implement this contract. Registration does not authorize execution. */
export interface ServiceProviderConnector {
  id: string;
  offer(): ServiceOffer;
  isAvailable(): Promise<boolean>;
  execute?(request: ProviderRequest): Promise<ProviderResult>;
}
const offer = (
  providerId: string,
  name: string,
  capabilities: CapabilityId[],
  price: number,
  latency: number,
  reliability: number,
  quality: number,
  independentVerification = false,
): ServiceOffer => ({
  providerId,
  name,
  capabilities,
  providerType: "mock",
  pricePerCallUsd: price,
  estimatedLatencySeconds: latency,
  reliabilityScore: reliability,
  qualityScore: quality,
  requiresApiKey: false,
  isEnabled: true,
  independentVerification,
  sourceGroup: providerId,
});
export const serviceOffers: readonly ServiceOffer[] = Object.freeze(
  [
    offer(
      "atlas-extract",
      "Atlas Extract",
      ["url_extract", "document_parse", "data_extract"],
      0.01,
      1,
      0.92,
      0.82,
    ),
    offer(
      "northstar-profile",
      "Northstar Profile",
      ["structured_profile", "data_extract"],
      0.04,
      3,
      0.96,
      0.96,
    ),
    offer(
      "pulse-news",
      "Pulse News",
      ["news_search", "web_research"],
      0.03,
      2,
      0.84,
      0.88,
    ),
    offer(
      "public-index-demo",
      "Public Index · demo",
      ["web_research", "news_search", "structured_profile"],
      0.02,
      5,
      0.86,
      0.8,
    ),
    offer(
      "proofline-verify",
      "Proofline Verify",
      ["claim_verification"],
      0.12,
      6,
      0.99,
      0.98,
      true,
    ),
    offer(
      "single-check",
      "Single-source Check",
      ["claim_verification"],
      0.02,
      1,
      0.9,
      0.8,
    ),
    offer("synthesis-local", "Synthesis Local", ["synthesis"], 0, 0.1, 1, 0.9),
    offer(
      "change-watch",
      "Change Watch · demo",
      ["change_detection"],
      0.01,
      1,
      0.94,
      0.9,
    ),
    offer(
      "precision-parse",
      "Precision Parse",
      ["document_parse", "data_extract"],
      0.04,
      4,
      0.98,
      0.98,
    ),
    offer(
      "expensive-research",
      "Expensive Research API · demo",
      [
        "web_research",
        "news_search",
        "structured_profile",
        "claim_verification",
      ],
      0.8,
      12,
      0.99,
      0.99,
      true,
    ),
    {
      ...offer(
        "public-web",
        "Public Web Adapter",
        ["web_research", "url_extract"],
        0,
        3,
        0.9,
        0.9,
      ),
      providerType: "public_web" as const,
      requiresApiKey: true,
      isEnabled: false,
    },
    {
      ...offer(
        "x402-catalog",
        "x402 Catalog Research Service",
        ["web_research", "claim_verification"],
        0.05,
        2,
        0.95,
        0.9,
        true,
      ),
      providerType: "x402_catalog_only" as const,
      isEnabled: false,
    },
  ].map((o) =>
    Object.freeze({
      ...o,
      capabilities: Object.freeze(o.capabilities) as unknown as CapabilityId[],
    }),
  ),
);

/** Catalog/public adapters have no execute member. The planner never invokes any connector. */
export function providerRegistry(): ServiceProviderConnector[] {
  return serviceOffers.map((o) => ({
    id: o.providerId,
    offer: () => structuredClone(o),
    isAvailable: async () => o.providerType === "mock" && o.isEnabled,
    ...(o.providerType === "mock"
      ? {
          execute: async (): Promise<ProviderResult> => ({
            isSimulated: true,
            actualCostUsd: 0,
            note: "Local simulation only; no service called.",
          }),
        }
      : {}),
  }));
}
