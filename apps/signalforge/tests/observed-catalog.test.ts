import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../src/server/intelligence/service", () => ({
  networkSnapshot: vi.fn(),
}));
import { networkSnapshot } from "../src/server/intelligence/service";
import { parseModelsDev } from "../src/server/intelligence/connectors/models-dev";
import {
  observedCatalogOptions,
  ObservedCatalogOptionSchema,
} from "../src/domain/observed-catalog";
import { ExecutionRouteContractSchema } from "../src/domain/route-planner";
import { ObjectiveInputSchema } from "../src/domain/objective";
import { handleRoutePlan } from "../src/server/route-http";
import { invokeSafeTool } from "../src/server/mcp";
import { PlanningResponseSchema } from "../src/domain/planning-response";
const at = "2026-08-30T00:00:00.000Z";
const now = Date.parse(at);
const listing = () =>
  parseModelsDev(
    {
      groq: {
        name: "Groq",
        models: {
          example: {
            id: "example",
            name: "Authored catalog fixture",
            modalities: { input: ["text"], output: ["text"] },
            cost: { input: 0.1, output: 0.2 },
          },
        },
      },
    },
    at,
  )[0];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("observed options preserve source, access limits and unknown task prices, not execution", () => {
  const [option] = observedCatalogOptions([listing()], ["synthesis"], now);
  expect(option.boundaryLabel).toBe(
    "NOT CALLED / NOT PAID / EXECUTION DISABLED",
  );
  expect(option).toMatchObject({
    sourceId: "modelsdev",
    sourceName: listing().sourceName,
    observedAt: at,
    selectionStatus: "discovery_only_not_selected",
    servicesCalled: false,
    paymentsMade: false,
    executionStatus: "execution_not_enabled",
    pricing: { model: "per_token", parseConfidence: "estimated" },
  });
  expect(option.pricing.amountUsd).toBeUndefined();
  expect(option.pricing.rawPriceText).toBeTruthy();
  expect(
    ObservedCatalogOptionSchema.safeParse({ ...option, servicesCalled: true })
      .success,
  ).toBe(false);
  expect(
    ObservedCatalogOptionSchema.safeParse({
      ...option,
      executionStatus: "executed",
    }).success,
  ).toBe(false);
});
it.each(["simulated_demo", "seeded_catalog", "error", "unavailable"] as const)(
  "%s can never become an observed option",
  (freshness) => {
    expect(
      observedCatalogOptions([{ ...listing(), freshness }], ["synthesis"], now),
    ).toEqual([]);
  },
);
it("ineligible, expired, future, seeded and unmatched entries stay out of route context", () => {
  const l = listing();
  expect(observedCatalogOptions([l], ["data_extract"], now)).toEqual([]);
  expect(observedCatalogOptions([l], ["synthesis"], now + 86400001)).toEqual(
    [],
  );
  expect(observedCatalogOptions([l], ["synthesis"], now - 1)).toEqual([]);
  expect(
    observedCatalogOptions(
      [{ ...l, dataQuality: { ...l.dataQuality, sourceTrust: "seeded" } }],
      ["synthesis"],
      now,
    ),
  ).toEqual([]);
  expect(
    observedCatalogOptions(
      [{ ...l, accessMode: "manual_seed" }],
      ["synthesis"],
      now,
    ),
  ).toEqual([]);
  expect(
    observedCatalogOptions(
      [{ ...l, dataQuality: { ...l.dataQuality, freshnessScore: 0 } }],
      ["synthesis"],
      now,
    ),
  ).toEqual([]);
});
it("public REST and MCP return the same validated context apart from demo route providers", async () => {
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("CACHE_MODE", "memory");
  for (const name of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ])
    vi.stubEnv(name, "");
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(networkSnapshot).mockResolvedValue({
    version: "1.0",
    records: [listing()],
    sources: [],
    cacheMode: "shared",
    warnings: [],
    executionStatus: "execution_not_enabled",
  });
  const input = ObjectiveInputSchema.parse({
    objective: "Build a verified due diligence route for a startup",
    budgetUsd: 0.25,
    optimizationPolicy: "most_verified",
  });
  const response = await handleRoutePlan(
    new Request("https://example.test/api/v1/routes/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  expect(response.status).toBe(200);
  const rest = PlanningResponseSchema.parse(await response.json());
  const mcp = PlanningResponseSchema.parse(
    await invokeSafeTool(
      "signalforge_plan_route",
      {
        objective: input.objective,
        budget_usd: input.budgetUsd,
        optimization_policy: input.optimizationPolicy,
      },
      new AbortController().signal,
    ),
  );
  expect(rest.route.observedSupply).toEqual(mcp.route.observedSupply);
  expect(rest.route.observedSupply).toHaveLength(1);
  expect(
    ExecutionRouteContractSchema.parse(JSON.parse(JSON.stringify(rest.route)))
      .executionStatus,
  ).toBe("execution_not_enabled");
  for (const step of rest.route.route) {
    expect(step.selectedProvider.providerType).toBe("mock");
    expect(step.selectedProvider.id).not.toBe(rest.route.observedSupply[0].id);
  }
  expect(rest.route.budget.actualCostUsd).toBe(0);
  expect(JSON.stringify(rest)).not.toMatch(
    /GROQ_API_KEY|UPSTASH_REDIS_REST_TOKEN|RATE_LIMIT_SALT/,
  );
});
