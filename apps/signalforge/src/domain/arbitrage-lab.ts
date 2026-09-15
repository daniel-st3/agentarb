import { TaskOpportunitySchema, type TaskOpportunity } from "./intelligence";
import { LabSpecSchema, type LabSpec } from "./arbitrage";
import type { CapabilityId } from "./objective";
type Fixture = { opportunity: TaskOpportunity; specification: LabSpec };
function fixture(
  id: string,
  title: string,
  payout: number | null,
  caps: CapabilityId[],
  spec: Partial<LabSpec> = {},
): Fixture {
  return {
    opportunity: TaskOpportunitySchema.parse({
      id: `lab:${id}`,
      sourceId: "arbitrage-lab",
      sourceName: "SignalForge Arbitrage Lab",
      listingType: "task_opportunity",
      title,
      description:
        "Prepare a bounded public information deliverable for operator review.",
      requiredCapabilities: caps,
      payout:
        payout === null
          ? { parseConfidence: "unknown" }
          : {
              amountUsd: payout / 100,
              currency: "USD",
              parseConfidence: "exact",
            },
      deadline: "Scenario: delivery within one day",
      claimModel: "buyer_selects",
      settlement: "unknown",
      actionability: "execution_not_enabled",
      constraints: [
        "SIMULATED fixture. No buyer, job, acceptance or payout exists.",
        "Source traits, prices and success rates are authored scenarios, not measurements.",
      ],
      accessMode: "manual_seed",
      freshness: "simulated_demo",
      observedAt: "2026-08-31T00:00:00.000Z",
      sourceUrl: "https://github.com/daniel-st3/agentarb/blob/codex/agent-arbitrage-underwriter/apps/signalforge/src/domain/arbitrage-lab.ts",
      executionStatus: "execution_not_enabled",
      dataQuality: {
        freshnessScore: 0,
        priceConfidence: payout === null ? "unknown" : "exact",
        actionabilityConfidence: "unknown",
        sourceTrust: "simulated",
        warnings: ["SIMULATED / ARBITRAGE LAB"],
      },
    }),
    specification: LabSpecSchema.parse({
      platformCostCents: 0,
      costOfFailureCents: 0,
      successProbabilityBps: 9000,
      independentVerification: false,
      ...spec,
    }),
  };
}
export const arbitrageLab: readonly Fixture[] = [
  fixture(
    "spread",
    "Public-data briefing",
    120,
    ["web_research", "synthesis"],
    {
      independentVerification: true,
      providerPricesCents: {
        "pulse-news": 22,
        "public-index-demo": 25,
        "proofline-verify": 18,
        "synthesis-local": 5,
      },
    },
  ),
  fixture(
    "extraction",
    "Structured extraction assignment",
    82,
    ["url_extract", "data_extract", "synthesis"],
    { platformCostCents: 2 },
  ),
  fixture(
    "verification",
    "Verification consumes the spread",
    12,
    ["web_research", "claim_verification", "synthesis"],
    { independentVerification: true, platformCostCents: 2 },
  ),
  fixture(
    "unroutable",
    "Unavailable document capability",
    95,
    ["document_parse", "synthesis"],
    { unavailableCapabilities: ["document_parse"] },
  ),
  fixture("unknown", "Missing payout specification", null, [
    "structured_profile",
    "synthesis",
  ]),
  fixture(
    "sensitive",
    "Policy-sensitive company profile",
    40,
    ["structured_profile", "synthesis"],
    { platformCostCents: 3 },
  ),
  fixture(
    "risk",
    "Attractive spread, uncertain acceptance",
    120,
    ["web_research", "synthesis"],
    {
      costOfFailureCents: 60,
      successProbabilityBps: 1000,
      providerPricesCents: {
        "pulse-news": 22,
        "public-index-demo": 25,
        "synthesis-local": 5,
      },
    },
  ),
];
export const findLab = (id: string) =>
  arbitrageLab.find((f) => f.opportunity.id === id);
