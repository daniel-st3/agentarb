import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  calculateEconomics,
  ArbitragePolicySchema,
  ArbitrageInputSchema,
  ArbitrageEvaluationSchema,
  evaluateArbitrage,
  usdToCents,
  classifyEconomics,
} from "../src/domain/arbitrage";
import { arbitrageLab, findLab } from "../src/domain/arbitrage-lab";
import {
  canonicalJson,
  hashReceipt,
  ArbitrageReceiptSchema,
} from "../src/server/arbitrage/service";
import { handleCatalog } from "../src/server/intelligence/http";
import { invokeSafeTool } from "../src/server/mcp";
import { parseMcpRegistry } from "../src/server/intelligence/connectors/mcp-registry";
import { mcpFixture } from "./intelligence-fixtures";
const policy = ArbitragePolicySchema.parse({});
const base = {
  payoutCents: 82,
  executionCostCents: 24,
  verificationCostCents: 1,
  platformCostCents: 2,
  costOfFailureCents: 0,
  successProbabilityBps: 9400,
};
const evaluate = (id: string, patch: object = {}, overrides: object = {}) => {
  const f = findLab("lab:" + id)!;
  return evaluateArbitrage(
    f.opportunity,
    { opportunityId: f.opportunity.id, responseVersion: "2.0", ...patch },
    { lab: { ...f.specification, ...overrides } },
  );
};
beforeEach(() => {
  vi.stubEnv("CACHE_MODE", "memory");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("DISCOVERY_MODE", "offline");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("integer underwriting", () => {
  it("reproduces the worked example exactly", () => {
    expect(calculateEconomics(base, policy)).toMatchObject({
      expectedTotalCostCents: 27,
      expectedProfitCents: 55,
      expectedMarginBps: 6707,
      riskAdjustedExpectedValueCents: 50,
      capitalAtRiskCents: 27,
      breakEvenPayoutCents: 29,
      requiredSuccessProbabilityBps: 3293,
    });
  });
  it("rounds failure costs upward and success revenue downward", () => {
    expect(
      calculateEconomics(
        { ...base, costOfFailureCents: 1, successProbabilityBps: 3333 },
        policy,
      ),
    ).toMatchObject({
      expectedFailureCostCents: 1,
      riskAdjustedExpectedValueCents: -1,
    });
  });
  it("uses floor rounding for negative margins", () => {
    expect(
      calculateEconomics(
        {
          ...base,
          payoutCents: 3,
          executionCostCents: 1,
          verificationCostCents: 1,
          platformCostCents: 2,
        },
        policy,
      ).expectedMarginBps,
    ).toBe(-3334);
  });
  it("zero payout has no margin, zero probability has no break-even payout", () => {
    expect(
      calculateEconomics(
        { ...base, payoutCents: 0, successProbabilityBps: 0 },
        policy,
      ),
    ).toMatchObject({
      expectedMarginBps: null,
      breakEvenPayoutCents: null,
      riskAdjustedExpectedValueCents: -27,
    });
  });
  it("required probability accounts for both conservative integer rounding steps", () => {
    const costs = {
      ...base,
      payoutCents: 3,
      executionCostCents: 1,
      verificationCostCents: 0,
      platformCostCents: 0,
      costOfFailureCents: 1,
    };
    const threshold = calculateEconomics(
      costs,
      policy,
    ).requiredSuccessProbabilityBps!;
    expect(threshold).toBe(6667);
    expect(
      calculateEconomics({ ...costs, successProbabilityBps: threshold }, policy)
        .riskAdjustedExpectedValueCents,
    ).toBeGreaterThanOrEqual(0);
    expect(
      calculateEconomics(
        { ...costs, successProbabilityBps: threshold - 1 },
        policy,
      ).riskAdjustedExpectedValueCents,
    ).toBeLessThan(0);
  });
  it.each([
    "payoutCents",
    "executionCostCents",
    "verificationCostCents",
    "platformCostCents",
    "costOfFailureCents",
  ] as const)("does not substitute missing %s", (key) => {
    const e = calculateEconomics({ ...base, [key]: null }, policy);
    expect(e.expectedProfitCents).toBeNull();
    expect(e.riskAdjustedExpectedValueCents).toBeNull();
  });
  it("unknown probability is not a fake default", () => {
    const e = calculateEconomics(
      { ...base, successProbabilityBps: null },
      policy,
    );
    expect(e.expectedProfitCents).toBe(55);
    expect(e.riskAdjustedExpectedValueCents).toBeNull();
    expect(e.breakEvenPayoutCents).toBeNull();
  });
  it("unknown probability and nonzero failure exposure leaves total unknown", () => {
    expect(
      calculateEconomics(
        { ...base, successProbabilityBps: null, costOfFailureCents: 10 },
        policy,
      ).expectedTotalCostCents,
    ).toBeNull();
  });
  it("maximum fulfillment bound accounts for fee, full failure reserve, margin and minimum profit", () => {
    const e = calculateEconomics({ ...base, costOfFailureCents: 50 }, policy);
    expect(e.maximumFulfillmentCostCents).toBe(48);
  });
  it.each([0.29, 0.01, 1.2, 100])("parses exact decimal USD %s", (n) =>
    expect(usdToCents(n)).toBe(Math.round(n * 100)),
  );
  it.each([0.001, -1, 1e20, NaN, Infinity])(
    "rejects non-cent published USD %s",
    (n) => expect(usdToCents(n)).toBeNull(),
  );
  it("rejects fractional money and probability outside basis-point bounds", () => {
    expect(() =>
      calculateEconomics({ ...base, executionCostCents: 0.5 }, policy),
    ).toThrow();
    expect(() =>
      calculateEconomics({ ...base, successProbabilityBps: 10001 }, policy),
    ).toThrow();
  });
  it("threshold boundaries are deterministic", () => {
    const e = calculateEconomics(base, policy);
    expect(
      classifyEconomics(e, { ...policy, minimumMarginBps: 6707 }, 9400)
        .decision,
    ).toBe("profitable");
    expect(
      classifyEconomics(e, { ...policy, minimumMarginBps: 6708 }, 9400)
        .decision,
    ).toBe("marginal");
  });
});
describe("demand and supply competition", () => {
  it.each(arbitrageLab)("validates isolated fixture $opportunity.id", (f) => {
    const e = evaluateArbitrage(
      f.opportunity,
      { opportunityId: f.opportunity.id, responseVersion: "2.0" },
      { lab: f.specification },
    );
    expect(ArbitrageEvaluationSchema.safeParse(e).success).toBe(true);
    expect(e.mode).toBe("lab");
    expect(e.servicesCalled).toBe(false);
    expect(e.paymentsMade).toBe(false);
    expect(e.actualSpendCents).toBe(0);
    for (const c of e.candidates) {
      expect(c.route.executionStatus).toBe("execution_not_enabled");
      expect(c.route.budget.actualCostUsd).toBe(0);
      expect(c.route.budget.estimatedRouteCostUsd).toBeLessThanOrEqual(
        policy.maximumRouteCostCents / 100,
      );
    }
  });
  it("hero spread is computed, not presentation constants", () =>
    expect(evaluate("spread").economics).toMatchObject({
      expectedTotalCostCents: 45,
      expectedProfitCents: 75,
      expectedMarginBps: 6250,
    }));
  it("verification can eliminate the spread", () =>
    expect(evaluate("verification").decision).toBe("uneconomic"));
  it("partial routes never claim achievable profit", () => {
    const e = evaluate("unroutable");
    expect(e.decision).toBe("unroutable");
    expect(e.economics.expectedProfitCents).toBeNull();
    expect(e.economics.riskAdjustedExpectedValueCents).toBeNull();
  });
  it("unknown payout produces explicit insufficient data", () =>
    expect(evaluate("unknown")).toMatchObject({
      decision: "insufficient_data",
      missingInputs: expect.arrayContaining(["payout_unknown"]),
    }));
  it("tight margin changes the selected decision", () =>
    expect(
      evaluate("sensitive", { policy: { minimumMarginBps: 9000 } }).decision,
    ).toBe("marginal"));
  it("risk-adjusted policy rejects a superficially positive spread", () => {
    const e = evaluate("risk", { policy: { optimization: "risk_adjusted" } });
    expect(e.economics.expectedProfitCents).toBeGreaterThan(0);
    expect(e.decision).toBe("uneconomic");
    expect(e.reasons).toContain("negative_risk_adjusted_value");
  });
  it("policy strategies can choose different full routes", () => {
    const a = evaluate("extraction"),
      b = evaluate("extraction", { policy: { optimization: "fastest" } });
    expect(a.candidates.length).toBeGreaterThan(1);
    expect(a.selectedRouteId).not.toBe(b.selectedRouteId);
  });
  it("critical dependencies precede verification and synthesis", () => {
    for (const c of evaluate("spread").candidates) {
      const seen = new Set<string>();
      for (const s of c.route.route) {
        s.dependencies.forEach((d) => expect(seen.has(d)).toBe(true));
        seen.add(s.capability);
      }
      expect(seen.has("claim_verification")).toBe(true);
    }
  });
  it("zero budget fails closed on missing critical coverage", () =>
    expect(
      evaluate("spread", { policy: { maximumRouteCostCents: 0 } }).decision,
    ).toBe("unroutable"));
  it("unknown Lab fees are explicit and block profit", () =>
    expect(
      evaluate("extraction", {}, { platformCostCents: null }),
    ).toMatchObject({
      decision: "insufficient_data",
      missingInputs: expect.arrayContaining(["platform_fee_unknown"]),
      economics: { expectedProfitCents: null },
    }));
  it("user scenarios retain distinct provenance", () =>
    expect(
      evaluate("unknown", {
        scenario: { payoutCents: 100, successProbabilityBps: 8000 },
      }),
    ).toMatchObject({
      economicProvenance: "user_scenario",
      payout: { provenance: "user_scenario" },
      risk: { probabilityProvenance: "user_scenario" },
    }));
  it("source/confidence/freshness policy gates block a profitable fixture", () => {
    for (const p of [
      { allowedSourceModes: ["observed"] },
      { allowedConfidence: ["high"] },
      { allowedFreshness: ["live"] },
    ])
      expect(evaluate("spread", { policy: p }).decision).toBe(
        "insufficient_data",
      );
  });
  it("observed inputs cannot borrow fixture prices, probability or execution eligibility", () => {
    const f = findLab("lab:spread")!,
      task = {
        ...f.opportunity,
        id: "observed:task",
        freshness: "live",
        observedAt: new Date().toISOString(),
      };
    expect(() =>
      evaluateArbitrage(
        task,
        { opportunityId: task.id, responseVersion: "2.0" },
        { lab: f.specification },
      ),
    ).toThrow();
    const e = evaluateArbitrage(
      task,
      { opportunityId: task.id, responseVersion: "2.0" },
      {
        supply: parseMcpRegistry(mcpFixture, new Date().toISOString()).filter(
          (l) => l.listingType === "service_offer",
        ),
      },
    );
    expect(e.decision).toBe("insufficient_data");
    expect(e.economics.expectedProfitCents).toBeNull();
    expect(e.risk.successProbabilityBps).toBeNull();
    expect(e.candidates).toEqual([]);
  });
  it("stale observations and unstructured payouts never become exact estimates", () => {
    const f = findLab("lab:spread")!;
    const e = evaluateArbitrage(
      {
        ...f.opportunity,
        id: "observed:old",
        freshness: "cached_live",
        observedAt: "2020-01-01T00:00:00Z",
        payout: {
          amountUsd: 1.2,
          currency: "USD",
          parseConfidence: "unstructured",
        },
      },
      { opportunityId: "observed:old", responseVersion: "2.0" },
    );
    expect(e.payout.amountCents).toBeNull();
    expect(e.missingInputs).toContain("stale_observation");
  });
  it("same snapshot, policy and fixture reproduce exact contracts", () =>
    expect(evaluate("spread")).toEqual(evaluate("spread")));
  it("rejects alternate endpoints, floating policy values and unknown fields", () => {
    for (const extra of [
      { url: "https://invalid.test" },
      { policy: { minimumMarginBps: 0.5 } },
      { scenario: { successProbability: 0.9 } },
      { execute: true },
    ])
      expect(
        ArbitrageInputSchema.safeParse({
          opportunityId: "lab:spread",
          responseVersion: "2.0",
          ...extra,
        }).success,
      ).toBe(false);
  });
});
describe("versioned interfaces", () => {
  it("canonical receipt serialization is valid JSON and stable under key ordering", () => {
    expect(JSON.parse(canonicalJson({ b: 2, a: { y: 1, x: 0 } }))).toEqual({
      a: { x: 0, y: 1 },
      b: 2,
    });
    expect(hashReceipt({ b: 2, a: 1 })).toBe(hashReceipt({ a: 1, b: 2 }));
  });
  it("REST and MCP compile the same economics with no external calls", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const input = { opportunityId: "lab:spread", responseVersion: "2.0" };
    const r = await handleCatalog(
      new Request("http://localhost/api/v1/opportunities/evaluate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.170",
        },
        body: JSON.stringify(input),
      }),
      "evaluate",
    );
    expect(r.status).toBe(200);
    const a = ArbitrageReceiptSchema.parse(await r.json());
    const b = ArbitrageReceiptSchema.parse(
      await invokeSafeTool(
        "signalforge_evaluate_opportunity",
        { opportunity_id: "lab:spread", response_version: "2.0" },
        new AbortController().signal,
      ),
    );
    expect(a.evaluation.economics).toEqual(b.evaluation.economics);
    expect(a.receiptHash).toBe(hashReceipt(a.evaluation));
    expect(f).not.toHaveBeenCalled();
  });
  it("legacy evaluation stays backward-compatible", async () => {
    const r = await handleCatalog(
      new Request("http://localhost/api/v1/opportunities/evaluate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.171",
        },
        body: JSON.stringify({ opportunityId: "demo:opportunity-1" }),
      }),
      "evaluate",
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toHaveProperty("projectedMarginUsd", null);
  });
  it("observed demand search never fills from Lab fixtures", async () => {
    const r = await handleCatalog(
      new Request("http://localhost/api/v1/opportunities?mode=observed", {
        headers: { "x-forwarded-for": "192.0.2.172" },
      }),
      "opportunities",
    );
    expect(await r.json()).toMatchObject({ mode: "observed", records: [] });
  });
  it("explicit MCP Lab search returns separate controlled tasks", async () => {
    const r = await invokeSafeTool(
      "signalforge_search_opportunities",
      { mode: "lab", limit: 3 },
      new AbortController().signal,
    );
    expect(r).toMatchObject({
      mode: "lab",
      executionStatus: "execution_not_enabled",
      records: expect.arrayContaining([
        expect.objectContaining({ freshness: "simulated_demo" }),
      ]),
    });
  });
  it("rejects duplicated/oversized query and body before network access", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const q of [
      "mode=lab&mode=observed",
      "limit=100",
      "url=https://invalid.test",
    ]) {
      expect(
        (
          await handleCatalog(
            new Request("http://localhost/api/v1/opportunities?" + q, {
              headers: { "x-forwarded-for": "192.0.2.173" },
            }),
            "opportunities",
          )
        ).status,
      ).toBe(400);
    }
    expect(f).not.toHaveBeenCalled();
  });
});
