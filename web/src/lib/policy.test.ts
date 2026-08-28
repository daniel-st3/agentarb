import { describe, expect, it } from "vitest";
import {
  PACKAGE_PREVIEW_CONSTANTS,
  REQUIRED_PROHIBITIONS,
  TEMPLATE_DEFAULTS,
  policyEnvelopeSchema,
  type Opportunity,
} from "./contracts";
import {
  MARKETPLACE_WRITE_ROUTES,
  PERSISTENCE_SURFACE,
  createPackagePreview,
  evaluateOpportunity,
} from "./policy";

const opportunity: Opportunity = {
  opportunityId: "mock:demo-research",
  marketplace: "mock",
  sourceType: "controlled_demonstration",
  observedAt: null,
  title: "Plan a comparison of public API documentation",
  description:
    "Create a question matrix and evidence checklist comparing pagination, versioning, and error handling. Produce only a structured research plan.",
  category: "research",
  payoutUsd: 24,
  requiredCapabilities: [],
  requiredReputation: 0,
  claimConstraint: "open_claim",
  settlementConstraint: "simulated",
};

function envelope() {
  return {
    ...structuredClone(TEMPLATE_DEFAULTS["Research Analyst"]),
    sessionId: "b62cfb55-84e6-4b6f-a550-199e932e7549",
  };
}

describe("public policy contract", () => {
  it("fails closed when a permanent prohibition is removed", () => {
    const value = envelope();
    value.profile.prohibitedActions = REQUIRED_PROHIBITIONS.filter(
      (action) => action !== "marketplace_write",
    );
    expect(policyEnvelopeSchema.safeParse(value).success).toBe(false);
  });

  it("allows only a bounded deterministic preview", () => {
    const value = envelope();
    const row = evaluateOpportunity(opportunity, value);
    expect(row.packageEligibility).toBe("allow");
    expect(row.external_execution_status).toBe("discovery_only");
    expect(row.actual_llm_inference_cost_usd).toBe(0);
    const preview = createPackagePreview(row, value);
    expect(preview).toMatchObject(PACKAGE_PREVIEW_CONSTANTS);
    expect(preview).not.toHaveProperty("packageId");
    expect(preview).not.toHaveProperty("approval");
  });

  it("refuses credential and private-data work before estimating", () => {
    const row = evaluateOpportunity(
      {
        ...opportunity,
        title: "Access restricted customer records",
        description:
          "Log in to a private customer system using provided credentials and extract private data.",
      },
      envelope(),
    );
    expect(row.packageEligibility).toBe("refuse");
    expect(row.reasonCodes[0]).toMatch(/^PROHIBITED_/);
    expect(row.estimated_task_execution_cost_usd).toBe(0);
  });

  it("has no persistence or marketplace-write route surface", () => {
    expect(PERSISTENCE_SURFACE).toEqual([]);
    expect(MARKETPLACE_WRITE_ROUTES).toEqual([]);
  });
});
