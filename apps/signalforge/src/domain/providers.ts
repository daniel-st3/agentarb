import {
  ServiceOfferSchema,
  type ServiceOffer,
  type ResearchRequest,
  type EvidenceItem,
  type Capability,
} from "./schema";
import { topicFor } from "./fixtures";
import catalog from "./catalog-v1.json";

export interface ProviderRequest {
  request: ResearchRequest;
  capability: Capability;
  at: string;
}
export interface ProviderResult {
  evidence: EvidenceItem[];
  actualCostUsd: 0;
  simulatedCostUsd: number;
}
export interface ServiceProviderConnector {
  id: string;
  offer(): ServiceOffer;
  isAvailable(): Promise<boolean>;
  execute(request: ProviderRequest): Promise<ProviderResult>;
}
function offer(
  id: string,
  name: string,
  cost: number,
  latency: number,
  quality: number,
  reliability: number,
  diversity: number,
  caps: Capability[],
): ServiceOffer {
  return ServiceOfferSchema.parse({
    providerId: id,
    name,
    description:
      "Deterministic, authored fictional-company evidence. No external call.",
    capabilities: caps,
    providerType: "mock",
    pricePerCallUsd: cost,
    estimatedLatencySeconds: latency,
    reliabilityScore: reliability,
    qualityScore: quality,
    requiresApiKey: false,
    isEnabled: true,
    metadata: {
      sourceGroup: id,
      diversityScore: diversity,
      priceBasis: "simulation",
    },
  });
}
export class MockResearchProvider implements ServiceProviderConnector {
  constructor(public id = "demo-research") {}
  offer() {
    return this.id === "demo-fast"
      ? offer(this.id, "Rapid index", 0.02, 1, 0.8, 0.9, 0.25, [
          "web_research",
          "structured_company_profile",
          "news_search",
        ])
      : offer(this.id, "Research library", 0, 7, 0.85, 0.94, 0.4, [
          "web_research",
          "structured_company_profile",
          "url_extract",
          "news_search",
        ]);
  }
  async isAvailable() {
    return true;
  }
  async execute({ request, at }: ProviderRequest): Promise<ProviderResult> {
    const topic = topicFor(request.question);
    const evidence: EvidenceItem[] = topic
      ? topic.findings.map((finding, i) => ({
          id: `ev-${this.id}-${i}`,
          claimId: `claim-${i}`,
          sourceTitle: `${topic.name} · ${i === 0 ? "product specification" : i === 1 ? "operating brief" : "disclosure record"} (fictional)`,
          sourceUrl: null,
          sourceType: "simulated_fixture",
          excerpt: finding[1],
          retrievedAt: at,
          providerId: this.id,
          independentSourceId: "fixture-company-documents",
          confidence: 0.72,
          isMock: true,
          provenanceLabel: "Simulated demo evidence",
        }))
      : [];
    return {
      evidence,
      actualCostUsd: 0,
      simulatedCostUsd: this.offer().pricePerCallUsd,
    };
  }
}
export class MockPremiumVerificationProvider implements ServiceProviderConnector {
  id = "demo-verification";
  offer() {
    return offer(this.id, "Independent review", 0.08, 10, 0.96, 0.97, 1, [
      "claim_verification",
    ]);
  }
  async isAvailable() {
    return true;
  }
  async execute({ request, at }: ProviderRequest): Promise<ProviderResult> {
    const topic = topicFor(request.question);
    const evidence: EvidenceItem[] = topic
      ? topic.findings.flatMap((finding, i) =>
          finding[2]
            ? [
                {
                  id: `ev-review-${i}`,
                  claimId: `claim-${i}`,
                  sourceTitle: `Independent assessment of ${topic.name} (fictional)`,
                  sourceUrl: null,
                  sourceType: "simulated_fixture" as const,
                  excerpt: finding[2],
                  retrievedAt: at,
                  providerId: this.id,
                  independentSourceId: "fixture-independent-review",
                  confidence: 0.84,
                  corroboratesClaimId: `claim-${i}`,
                  isMock: true as const,
                  provenanceLabel: "Simulated demo evidence" as const,
                },
              ]
            : [],
        )
      : [];
    return { evidence, actualCostUsd: 0, simulatedCostUsd: 0.08 };
  }
}
export class MockSynthesisProvider implements ServiceProviderConnector {
  id = "demo-synthesis";
  offer() {
    return offer(this.id, "Brief compiler", 0, 1, 0.86, 1, 0, ["synthesis"]);
  }
  async isAvailable() {
    return true;
  }
  async execute(): Promise<ProviderResult> {
    return { evidence: [], actualCostUsd: 0, simulatedCostUsd: 0 };
  }
}
export class PublicWebResearchProvider implements ServiceProviderConnector {
  id = "public-research";
  offer() {
    return ServiceOfferSchema.parse({
      ...offer(this.id, "Public-source research", 0.03, 5, 0.9, 0.92, 0.9, [
        "web_research",
      ]),
      providerType: "public_source",
      requiresApiKey: true,
      isEnabled: false,
      description:
        "Reserved adapter interface. No real research calls in this MVP.",
      metadata: {
        sourceGroup: "unconfigured-public-source",
        diversityScore: 0.9,
        priceBasis: "simulation",
        unavailableReason:
          "No live adapter is configured. Adding a key alone cannot enable execution.",
      },
    });
  }
  async isAvailable() {
    return false;
  }
  async execute(): Promise<ProviderResult> {
    throw new Error("Public research is unavailable in demo mode.");
  }
}
export class X402ServiceCatalogProvider implements ServiceProviderConnector {
  id = "catalog-web";
  offer() {
    return ServiceOfferSchema.parse(catalog.offers[0]);
  }
  async isAvailable() {
    return false;
  }
  async execute(): Promise<ProviderResult> {
    throw new Error("Catalog-only services cannot execute.");
  }
}
export function providers(): ServiceProviderConnector[] {
  return [
    new MockResearchProvider(),
    new MockResearchProvider("demo-fast"),
    new MockPremiumVerificationProvider(),
    new MockSynthesisProvider(),
    new PublicWebResearchProvider(),
    new X402ServiceCatalogProvider(),
  ];
}
