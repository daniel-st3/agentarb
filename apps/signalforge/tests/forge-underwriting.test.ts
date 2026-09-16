import { describe, expect, it } from "vitest";
import {
  evaluateForgeScenario,
  type ForgeUnderwritingInput,
} from "../src/domain/forge-underwriting";
import { decomposeObjective } from "../src/domain/objective";
import { buildExecutionRoute } from "../src/domain/route-planner";
import { PlanningResponseSchema } from "../src/domain/planning-response";
import { ObservedCatalogOptionSchema } from "../src/domain/observed-catalog";

const objective = {
  objective: "Review public information and return a structured synthesis.",
  budgetUsd: 10,
  optimizationPolicy: "best_value" as const,
  mode: "demo" as const,
};

const option = ObservedCatalogOptionSchema.parse({
  id: "fixture:observed-context",
  name: "Observed context fixture",
  sourceId: "fixture-source",
  sourceName: "Official fixture source",
  freshness: "live" as const,
  observedAt: "2026-09-16T12:00:00.000Z",
  sourceUrl: "https://example.com/catalog",
  accessMode: "official_catalog" as const,
  actionability: "catalog_only" as const,
  capabilities: ["web_research", "synthesis"],
  pricing: {
    model: "unknown" as const,
    parseConfidence: "unknown" as const,
    rawPriceText: "Contact provider",
  },
  selectionStatus: "discovery_only_not_selected" as const,
  label: "Observed Catalog Option" as const,
  boundaryLabel: "NOT CALLED / NOT PAID / EXECUTION DISABLED" as const,
  servicesCalled: false as const,
  paymentsMade: false as const,
  executionStatus: "execution_not_enabled" as const,
  reason: "Context only; not a task quote.",
});

const partialOption = ObservedCatalogOptionSchema.parse({
  ...option,
  id: "fixture:partial-observed-context",
  capabilities: ["synthesis"],
});

function planning(available = true, covered = true) {
  const frame = decomposeObjective(objective);
  const route = buildExecutionRoute(objective, frame, {
    offers: [],
    id: "forge_test_route",
    createdAt: "2026-09-16T12:00:00.000Z",
  });
  route.executionMode = "planning_only";
  route.provenance.isSimulated = false;
  route.provenance.note = "Observed context only; execution disabled.";
  route.observedSupply = covered ? [option] : available ? [partialOption] : [];
  return PlanningResponseSchema.parse({
    objectiveFrame: frame,
    route,
    decompositionSource: "local_demo_fallback",
    freshnessSummary: [
      {
        connectorId: "fixture-source",
        name: "Fixture source",
        kind: "service_catalog",
        status: available ? "healthy" : "unavailable",
        accessMode: "official_catalog",
        enabled: true,
        freshness: available ? "live" : "unavailable",
        lastAttemptAt: "2026-09-16T12:00:00.000Z",
        cachedRecordCount: available ? 1 : 0,
      },
    ],
    warnings: available ? [] : ["Catalog unavailable."],
    executionStatus: "execution_not_enabled",
  });
}

function scenario(overrides: Partial<ForgeUnderwritingInput["scenario"]> = {}): ForgeUnderwritingInput {
  return {
    objective,
    locale: "en",
    scenario: {
      payoutUsd: "20.00",
      fulfillmentCostUsd: "2.00",
      successProbabilityBps: 9000,
      humanReviewCostUsd: "1.00",
      verificationCostUsd: "0.00",
      platformCostUsd: "0.00",
      failureCostUsd: "0.00",
      refundableCapitalUsd: "5.00",
      minimumMarginBps: 2500,
      ...overrides,
    },
  };
}

describe("Forge Lab server-authoritative scenario economics", () => {
  it("calculates a complete conditional scenario with explicit provenance", () => {
    const result = evaluateForgeScenario(scenario(), planning());
    expect(result.decision).toBe("conditionally_profitable");
    expect(result.economics.expectedTotalCostCents).toBe(300);
    expect(result.economics.expectedProfitCents).toBe(1700);
    expect(result.economics.riskAdjustedExpectedValueCents).toBe(1500);
    expect(result.scenario.payout.provenance).toBe("user_scenario");
    expect(result.financialExposure).toEqual({
      expectedTotalCostCents: 300,
      refundableCapitalCents: 500,
      capitalRequiredCents: 800,
      refundableCapitalIsExpense: false,
    });
  });

  it("keeps omitted payout unknown rather than zero", () => {
    const result = evaluateForgeScenario(
      scenario({ payoutUsd: undefined }),
      planning(),
    );
    expect(result.decision).toBe("insufficient_data");
    expect(result.scenario.payout.valueCents).toBeNull();
    expect(result.economics.expectedProfitCents).toBeNull();
    expect(result.blockers).toContain("payout_unknown");
  });

  it("requires an explicit fulfillment cost", () => {
    const result = evaluateForgeScenario(
      scenario({ fulfillmentCostUsd: undefined }),
      planning(),
    );
    expect(result.decision).toBe("insufficient_data");
    expect(result.economics.expectedTotalCostCents).toBeNull();
    expect(result.blockers).toContain("fulfillment_cost_unknown");
  });

  it("marks a hard-budget violation unroutable without inventing a provider", () => {
    const result = evaluateForgeScenario(
      scenario({ fulfillmentCostUsd: "11.00" }),
      planning(),
    );
    expect(result.decision).toBe("unroutable");
    expect(result.blockers).toContain("hard_budget_exceeded");
    expect(result.routeEvidence.boundary).toBe(
      "observed_context_only_not_a_route_quote",
    );
  });

  it("recalculates the deterministic decision when a user assumption changes", () => {
    const favorable = evaluateForgeScenario(scenario(), planning());
    const challenged = evaluateForgeScenario(
      scenario({ successProbabilityBps: 1000 }),
      planning(),
    );
    expect(favorable.decision).toBe("conditionally_profitable");
    expect(challenged.decision).toBe("conditionally_uneconomic");
    expect(challenged.economics.riskAdjustedExpectedValueCents).toBe(-100);
  });

  it("reports unavailable catalog context honestly", () => {
    const result = evaluateForgeScenario(scenario(), planning(false, false));
    expect(result.routeEvidence.status).toBe("catalog_degraded");
    expect(result.decision).toBe("conditionally_profitable");
    expect(result.limitations).toContain("observed_catalog_unavailable");
  });

  it("does not promote incomplete bounded supply into a route candidate", () => {
    const result = evaluateForgeScenario(scenario(), planning(true, false));
    expect(result.routeEvidence.status).toBe("coverage_incomplete");
    expect(result.decision).toBe("conditionally_profitable");
    expect(result.limitations).toContain(
      "observed_capability_context_incomplete",
    );
  });
});
