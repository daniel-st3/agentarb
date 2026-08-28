import { describe, it, expect } from "vitest";
import fixtures from "../../tests/fixtures/policy-parity.json";
import { TEMPLATE_DEFAULTS, type Opportunity } from "./contracts";
import { evaluateOpportunity } from "./policy";
import { classify } from "./discovery";

describe("Python hosted policy parity (not marketplace success)", () => {
  it.each(
    fixtures.map((fixture) => ({
      ...fixture,
      name: fixture.template + " / " + fixture.task.bounty_id,
    })),
  )("$name", ({ template, task, expected }) => {
    const market = task.marketplace as Opportunity["marketplace"];
    const row = evaluateOpportunity(
      {
        opportunityId: expected.opportunity_id,
        marketplace: market,
        title: task.title,
        description: task.description,
        tags: task.tags,
        category: task.category as Opportunity["category"],
        payoutUsd: task.payout_usd,
        sourceType: "controlled_demonstration",
        observedAt: null,
        requiredCapabilities: [],
        requiredReputation: 0,
        claimConstraint: market === "opentask" ? "bid" : "open_claim",
        settlementConstraint:
          market === "mock"
            ? "simulated"
            : market === "opentask"
              ? "offplatform"
              : "onchain",
      },
      {
        ...TEMPLATE_DEFAULTS[template as keyof typeof TEMPLATE_DEFAULTS],
        sessionId: "b62cfb55-84e6-4b6f-a550-199e932e7549",
      },
    );
    expect(row.packageEligibility).toBe(expected.package_eligibility);
    expect(row.reasonCodes).toEqual(expected.reason_codes);
    expect(row.confidence).toBe(expected.confidence);
    expect(row.pSuccess).toBe(expected.p_success);
    expect(row.estimated_task_execution_cost_usd).toBe(
      expected.estimated_task_execution_cost_usd,
    );
    expect(row.expected_margin_usd).toBeCloseTo(
      expected.expected_margin_usd,
      8,
    );
    expect(row.actual_llm_inference_cost_usd).toBe(0);
  });
  it("preserves exact tag priority before title matches", () => {
    expect(classify(["research", "python"], "Summarize an API")).toBe(
      "small_code",
    );
    expect(classify(["json"], "Research inventory")).toBe("data_lookup");
    expect(classify(["unknown"], "photograph this")).toBe("unknown");
  });
});
