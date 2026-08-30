import { describe, it, expect, vi } from "vitest";
import {
  ObjectiveInputSchema,
  decomposeObjective,
} from "../src/domain/objective";
import {
  buildExecutionRoute,
  ExecutionRouteContractSchema,
  seedRoutes,
} from "../src/domain/route-planner";
import {
  serviceOffers,
  providerRegistry,
} from "../src/domain/service-registry";
const input = ObjectiveInputSchema.parse({
  objective:
    "Build a due diligence route for a startup with independent verification",
  budgetUsd: 0.25,
  optimizationPolicy: "most_verified",
});
describe("deterministic execution contract", () => {
  it.each([0, 0.01, 0.05, 0.1, 0.15, 0.25, 1, 3, 10])(
    "never exceeds $%s",
    (budgetUsd) => {
      for (const policy of [
        "cheapest",
        "best_value",
        "most_verified",
        "fastest",
      ] as const) {
        const r = buildExecutionRoute({
          ...input,
          budgetUsd,
          optimizationPolicy: policy,
        });
        expect(r.budget.estimatedRouteCostUsd).toBeLessThanOrEqual(budgetUsd);
        expect(r.budget.actualCostUsd).toBe(0);
      }
    },
  );
  it("low-budget diligence is partial, never verified", () => {
    const r = buildExecutionRoute({ ...input, budgetUsd: 0.1 });
    expect(r.status).toBe("partial");
    expect(r.unmetRequirements.join()).toContain(
      "Independent corroboration cannot be met",
    );
  });
  it(".25 most verified covers critical capabilities with independent verification", () => {
    const r = buildExecutionRoute(input);
    expect(r.status).toBe("planned");
    expect(
      r.route.find((s) => s.capability === "claim_verification")
        ?.selectedProvider.id,
    ).toBe("proofline-verify");
    for (const c of r.objectiveFrame.requiredCapabilities.filter(
      (c) => c.priority === "critical",
    ))
      expect(r.route.some((s) => s.capability === c.id)).toBe(true);
  });
  it("orders dependencies and rejects cycles", () => {
    const r = buildExecutionRoute(input),
      seen = new Set<string>();
    for (const s of r.route) {
      s.dependencies.forEach((d) => expect(seen.has(d)).toBe(true));
      seen.add(s.capability);
    }
    const f = decomposeObjective(input);
    f.requiredCapabilities[0].dependencies = ["synthesis"];
    expect(() => buildExecutionRoute(input, f)).toThrow();
  });
  it("policies choose reproducible distinct routes", () => {
    const q = {
      ...input,
      objective: "Turn a website into structured company data",
    };
    const cheapest = buildExecutionRoute({
        ...q,
        optimizationPolicy: "cheapest",
      }),
      value = buildExecutionRoute({ ...q, optimizationPolicy: "best_value" });
    expect(cheapest.budget.estimatedRouteCostUsd).toBeLessThan(
      value.budget.estimatedRouteCostUsd,
    );
    expect(buildExecutionRoute(q)).toEqual(buildExecutionRoute(q));
  });
  it("latency is a hard constraint and fastest cannot remove critical capabilities", () => {
    const r = buildExecutionRoute({
      ...input,
      objective: input.objective + " within 3 seconds",
      optimizationPolicy: "fastest",
    });
    expect(
      r.route.reduce(
        (n, s) => n + s.selectedProvider.estimatedLatencySeconds,
        0,
      ),
    ).toBeLessThanOrEqual(3);
    expect(r.status).toBe("partial");
  });
  it("explains unavailable, missing-key, overpriced and weak verification alternatives", () => {
    const reasons = new Set(
      buildExecutionRoute(input).rejectedAlternatives.map((r) => r.reason),
    );
    for (const reason of [
      "unavailable",
      "missing_configuration",
      "over_budget",
      "insufficient_verification",
    ])
      expect(reasons.has(reason as never)).toBe(true);
  });
  it("monitoring budgets include every modeled recurring call", () => {
    const r = buildExecutionRoute({
      ...input,
      objective: "Monitor competitor pricing changes under $3/month",
      budgetUsd: 3,
      optimizationPolicy: "best_value",
    });
    expect(r.objectiveFrame.expectedOutput.format).toBe("monitoring_spec");
    expect(r.monitoringSpec?.schedulerEnabled).toBe(false);
    expect(r.monitoringSpec?.estimatedMonthlyCostUsd).toBe(
      r.budget.estimatedRouteCostUsd,
    );
    expect(r.route.some((s) => s.capability === "change_detection")).toBe(true);
  });
  it("catalog providers have no execute implementation; planner never invokes connectors", () => {
    for (const p of providerRegistry().filter(
      (p) => p.offer().providerType !== "mock",
    ))
      expect(p.execute).toBeUndefined();
    const network = vi.spyOn(globalThis, "fetch");
    const r = buildExecutionRoute(input);
    expect(network).not.toHaveBeenCalled();
    expect(
      r.route.every((s) => s.selectedProvider.providerType === "mock"),
    ).toBe(true);
    network.mockRestore();
  });
  it("fallback substitutes fit budget and retained verification constraints", () => {
    const r = buildExecutionRoute(input);
    for (const s of r.route) {
      if (s.fallbackProvider) {
        const f = serviceOffers.find(
          (o) => o.providerId === s.fallbackProvider!.id,
        )!;
        expect(
          r.budget.estimatedRouteCostUsd -
            s.selectedProvider.estimatedCostUsd +
            f.pricePerCallUsd,
        ).toBeLessThanOrEqual(r.budget.hardCapUsd + 0.00001);
        if (s.capability === "claim_verification")
          expect(f.independentVerification).toBe(true);
      }
    }
  });
  it("JSON cannot authorize services or paid/live execution", () => {
    for (const r of seedRoutes()) {
      expect(
        ExecutionRouteContractSchema.parse(JSON.parse(JSON.stringify(r))),
      ).toEqual(r);
      expect(r.executionStatus).toBe("execution_not_enabled");
      expect(r.provenance).toMatchObject({
        servicesCalled: false,
        paymentsMade: false,
      });
      expect(
        ExecutionRouteContractSchema.safeParse({
          ...r,
          executionMode: "future_live_execution",
        }).success,
      ).toBe(false);
      expect(
        ExecutionRouteContractSchema.safeParse({
          ...r,
          budget: { ...r.budget, actualCostUsd: 1 },
        }).success,
      ).toBe(false);
    }
  });
});
