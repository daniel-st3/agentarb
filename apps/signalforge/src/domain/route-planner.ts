import { z } from "zod";
import {
  ObjectiveFrameSchema,
  ObjectiveInputSchema,
  decomposeObjective,
  governObjectiveFrame,
  type ObjectiveFrame,
  type ObjectiveInput,
} from "./objective";
import { serviceOffers, type ServiceOffer } from "./service-registry";
import { ObservedCatalogOptionSchema } from "./observed-catalog";
const rejectionReasons = [
  "over_budget",
  "unavailable",
  "missing_configuration",
  "lower_reliability",
  "lower_quality",
  "insufficient_verification",
  "latency_constraint",
  "capability_mismatch",
] as const;
const ProviderSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    providerType: z.enum(["mock", "public_web", "x402_catalog_only"]),
    estimatedCostUsd: z.number().nonnegative(),
    estimatedLatencySeconds: z.number().nonnegative(),
    reliabilityScore: z.number().min(0).max(1),
    qualityScore: z.number().min(0).max(1),
  })
  .strict();
export const ExecutionRouteContractSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    routeId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    objective: z.string(),
    objectiveFrame: ObjectiveFrameSchema,
    status: z.enum(["planned", "simulated", "partial", "failed"]),
    executionMode: z.literal("demo_simulation"),
    executionStatus: z
      .literal("execution_not_enabled")
      .default("execution_not_enabled"),
    budget: z
      .object({
        hardCapUsd: z.number().nonnegative(),
        estimatedRouteCostUsd: z.number().nonnegative(),
        actualCostUsd: z.literal(0),
        currency: z.literal("USD"),
      })
      .strict(),
    route: z.array(
      z
        .object({
          step: z.number().int().positive(),
          capability: z.string(),
          selectedProvider: ProviderSchema,
          inputContract: z.string(),
          outputContract: z.string(),
          dependencies: z.array(z.string()),
          verificationRequired: z.boolean(),
          fallbackProvider: z
            .object({ id: z.string(), name: z.string(), reason: z.string() })
            .strict()
            .optional(),
          rationale: z.string(),
        })
        .strict(),
    ),
    rejectedAlternatives: z.array(
      z
        .object({
          providerId: z.string(),
          capability: z.string(),
          reason: z.enum(rejectionReasons),
          explanation: z.string(),
        })
        .strict(),
    ),
    verificationPolicy: z
      .object({
        standard: z.enum([
          "none",
          "single_source",
          "independent_corroboration",
        ]),
        materialClaimsRequireIndependentSources: z.boolean(),
      })
      .strict(),
    stopConditions: z.array(z.string()),
    unmetRequirements: z.array(z.string()),
    observedSupply: z
      .array(ObservedCatalogOptionSchema)
      .max(8)
      .default([]),
    monitoringSpec: z
      .object({
        intervalHours: z.literal(24),
        executionsPerMonth: z.literal(30),
        alertThreshold: z.string(),
        estimatedPerRunCostUsd: z.number(),
        estimatedMonthlyCostUsd: z.number(),
        schedulerEnabled: z.literal(false),
      })
      .strict()
      .optional(),
    provenance: z
      .object({
        isSimulated: z.literal(true),
        servicesCalled: z.literal(false),
        paymentsMade: z.literal(false),
        note: z.string(),
      })
      .strict(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.budget.estimatedRouteCostUsd > r.budget.hardCapUsd + 1e-8)
      ctx.addIssue({ code: "custom", message: "Route exceeds budget." });
    const seen = new Set<string>();
    for (const [i, s] of r.route.entries()) {
      if (
        s.step !== i + 1 ||
        seen.has(s.capability) ||
        s.dependencies.some((d) => !seen.has(d)) ||
        s.selectedProvider.providerType !== "mock"
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid demo route or dependency order.",
        });
      seen.add(s.capability);
    }
    if (
      (r.status === "planned" || r.status === "simulated") &&
      r.unmetRequirements.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Incomplete route cannot be marked ready.",
      });
  });
export type ExecutionRouteContract = z.infer<
  typeof ExecutionRouteContractSchema
>;
type Assignment = Map<string, ServiceOffer>;
const cents = (n: number) => Math.round(n * 100);
const rounded = (n: number) => Math.round(n * 100) / 100;
export function orderedCapabilities(frame: ObjectiveFrame) {
  const f = ObjectiveFrameSchema.parse(frame),
    result: ObjectiveFrame["requiredCapabilities"] = [],
    seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    const c = f.requiredCapabilities.find((c) => c.id === id)!;
    c.dependencies.forEach(visit);
    seen.add(id);
    result.push(c);
  }
  f.requiredCapabilities.forEach((c) => visit(c.id));
  return result;
}
export function buildExecutionRoute(
  raw: ObjectiveInput,
  proposed?: ObjectiveFrame,
  options: {
    id?: string;
    createdAt?: string;
    offers?: readonly ServiceOffer[];
  } = {},
): ExecutionRouteContract {
  const input = ObjectiveInputSchema.parse(raw),
    frame = proposed
      ? governObjectiveFrame(input, proposed)
      : decomposeObjective(input);
  const caps = orderedCapabilities(frame),
    offers = options.offers ?? serviceOffers,
    independent =
      frame.constraints.verificationStandard === "independent_corroboration",
    multiplier = frame.constraints.requiresRecurringExecution ? 30 : 1;
  const maxCents = cents(input.budgetUsd),
    maxLatency = frame.constraints.maxLatencySeconds ?? Infinity;
  const critical = new Set(
    caps.filter((c) => c.priority === "critical").map((c) => c.id),
  );
  function requireDependencies(id: string) {
    const c = caps.find((c) => c.id === id)!;
    for (const d of c.dependencies)
      if (!critical.has(d)) {
        critical.add(d);
        requireDependencies(d);
      }
  }
  [...critical].forEach(requireDependencies);
  function eligibility(
    o: ServiceOffer,
    cap: string,
  ): (typeof rejectionReasons)[number] | null {
    if (!o.capabilities.includes(cap as never)) return "capability_mismatch";
    if (o.requiresApiKey) return "missing_configuration";
    if (!o.isEnabled || o.providerType !== "mock") return "unavailable";
    if (o.reliabilityScore < 0.8) return "lower_reliability";
    if (o.qualityScore < 0.75) return "lower_quality";
    if (
      cap === "claim_verification" &&
      independent &&
      !o.independentVerification
    )
      return "insufficient_verification";
    if (cents(o.pricePerCallUsd) * multiplier > maxCents) return "over_budget";
    if (o.estimatedLatencySeconds > maxLatency) return "latency_constraint";
    return null;
  }
  const eligible = new Map(
    caps.map((c) => [
      c.id,
      offers
        .filter((o) => !eligibility(o, c.id))
        .sort((a, b) => a.providerId.localeCompare(b.providerId)),
    ]),
  );
  // Bounded exhaustive competition: nine capabilities, a small fixed registry.
  // Skipping is explicit; missing critical requirements can only produce partial routes.
  let best: Assignment = new Map(),
    bestScore = -Infinity,
    bestCoverage = -1;
  function score(a: Assignment, cost: number, latency: number) {
    const selected = [...a.values()],
      count = Math.max(caps.length, 1);
    const quality =
      selected.reduce((n, o) => n + o.qualityScore * o.reliabilityScore, 0) /
      count;
    const diversity = new Set(selected.map((o) => o.sourceGroup)).size / count;
    const costRatio = cost / Math.max(maxCents, 1),
      speed = latency / Math.max(maxLatency === Infinity ? 30 : maxLatency, 1),
      coverage = a.size / count;
    switch (input.optimizationPolicy) {
      case "cheapest":
        return -cost * 100 + quality + coverage;
      case "fastest":
        return -latency * 10 + quality + coverage * 0.1;
      case "most_verified":
        return (
          0.55 * quality +
          0.35 * diversity +
          0.3 * coverage -
          0.08 * costRatio -
          0.02 * speed
        );
      default:
        return (
          0.48 * quality +
          0.27 * diversity +
          0.2 * coverage -
          0.18 * costRatio -
          0.07 * speed
        );
    }
  }
  function compete(
    index: number,
    a: Assignment,
    cost: number,
    latency: number,
  ) {
    if (index === caps.length) {
      const coverage = [...critical].filter((id) => a.has(id)).length;
      const s = score(a, cost, latency);
      if (
        coverage > bestCoverage ||
        (coverage === bestCoverage && s > bestScore)
      ) {
        bestCoverage = coverage;
        bestScore = s;
        best = new Map(a);
      }
      return;
    }
    const c = caps[index];
    if (c.dependencies.every((d) => a.has(d)))
      for (const o of eligible.get(c.id)!) {
        const next = cost + cents(o.pricePerCallUsd) * multiplier,
          duration = latency + o.estimatedLatencySeconds;
        if (next <= maxCents && duration <= maxLatency) {
          a.set(c.id, o);
          compete(index + 1, a, next, duration);
          a.delete(c.id);
        }
      }
    compete(index + 1, a, cost, latency);
  }
  compete(0, new Map(), 0, 0);
  const total = rounded(
      [...best.values()].reduce(
        (n, o) => n + o.pricePerCallUsd * multiplier,
        0,
      ),
    ),
    latency = [...best.values()].reduce(
      (n, o) => n + o.estimatedLatencySeconds,
      0,
    );
  const unmet = [...critical]
    .filter((id) => !best.has(id))
    .map(
      (id) => `Critical capability unavailable within budget/latency: ${id}.`,
    );
  if (independent && !best.get("claim_verification")?.independentVerification)
    unmet.push(
      "Independent corroboration cannot be met. Do not treat material claims as verified.",
    );
  const rejected: ExecutionRouteContract["rejectedAlternatives"] = [];
  for (const c of caps)
    for (const o of offers)
      if (best.get(c.id)?.providerId !== o.providerId) {
        let reason = eligibility(o, c.id);
        if (
          !reason &&
          total +
            (o.pricePerCallUsd - (best.get(c.id)?.pricePerCallUsd ?? 0)) *
              multiplier >
            input.budgetUsd + 1e-8
        )
          reason = "over_budget";
        if (
          !reason &&
          latency +
            o.estimatedLatencySeconds -
            (best.get(c.id)?.estimatedLatencySeconds ?? 0) >
            maxLatency
        )
          reason = "latency_constraint";
        reason ??=
          o.reliabilityScore < (best.get(c.id)?.reliabilityScore ?? 1)
            ? "lower_reliability"
            : "lower_quality";
        rejected.push({
          providerId: o.providerId,
          capability: c.id,
          reason,
          explanation:
            reason === "lower_quality" || reason === "lower_reliability"
              ? `Not selected: lower policy-adjusted route score for ${input.optimizationPolicy}; reliability, quality, diversity, cost and latency are compared together.`
              : `Rejected: ${reason.replaceAll("_", " ")}. ${reason === "insufficient_verification" ? "A separate independent verification source group is required." : reason === "over_budget" ? "The full route must fit the hard cap, including recurring calls." : "No service was called."}`,
        });
      }
  const route: ExecutionRouteContract["route"] = [];
  for (const c of caps) {
    const o = best.get(c.id);
    if (!o) continue;
    const fallback = eligible
      .get(c.id)!
      .find(
        (f) =>
          f.providerId !== o.providerId &&
          total + (f.pricePerCallUsd - o.pricePerCallUsd) * multiplier <=
            input.budgetUsd + 1e-8 &&
          latency + f.estimatedLatencySeconds - o.estimatedLatencySeconds <=
            maxLatency,
      );
    route.push({
      step: route.length + 1,
      capability: c.id,
      selectedProvider: {
        id: o.providerId,
        name: o.name,
        providerType: o.providerType,
        estimatedCostUsd: o.pricePerCallUsd,
        estimatedLatencySeconds: o.estimatedLatencySeconds,
        reliabilityScore: o.reliabilityScore,
        qualityScore: o.qualityScore,
      },
      inputContract: c.dependencies.length
        ? `Validated outputs from ${c.dependencies.join(", ")}; no credentials or private data.`
        : "Operator objective and public context, supplied by the calling agent.",
      outputContract: `Structured ${c.label.toLowerCase()} output with provenance, uncertainty, and validation status.`,
      dependencies: c.dependencies,
      verificationRequired:
        independent && (c.id === "claim_verification" || c.id === "synthesis"),
      ...(fallback
        ? {
            fallbackProvider: {
              id: fallback.providerId,
              name: fallback.name,
              reason:
                "Eligible replacement, not an additional call. Replan against remaining budget after any failed call; never retry if the hard cap could be exceeded.",
            },
          }
        : {}),
      rationale: `Selected by ${input.optimizationPolicy.replaceAll("_", " ")} across budget-feasible dependency routes. Quality ${o.qualityScore}; reliability ${o.reliabilityScore}; ${o.independentVerification ? "independent verification capability" : "no verification result claimed"}.`,
    });
  }
  return ExecutionRouteContractSchema.parse({
    schemaVersion: "1.0",
    routeId: options.id ?? "route_preview",
    objective: input.objective,
    objectiveFrame: frame,
    status: unmet.length ? "partial" : "planned",
    executionMode: "demo_simulation",
    budget: {
      hardCapUsd: input.budgetUsd,
      estimatedRouteCostUsd: total,
      actualCostUsd: 0,
      currency: "USD",
    },
    route,
    rejectedAlternatives: rejected,
    verificationPolicy: {
      standard: frame.constraints.verificationStandard,
      materialClaimsRequireIndependentSources: independent,
    },
    stopConditions: [
      ...unmet,
      "Stop before any external service call: this contract is demo-only, not execution authorization.",
      "Stop if the remaining hard budget cannot cover a step or fallback; failed calls may consume budget in future execution.",
      "Stop if required dependencies, public inputs, reliability or evidence standards cannot be met.",
      "Never send credentials, private data, payments, wallet instructions, or executable code.",
      "Catalog-only offers cannot execute. Independent corroboration requires genuinely independent evidence, not two labels from one source.",
    ],
    unmetRequirements: unmet,
    ...(multiplier === 30
      ? {
          monitoringSpec: {
            intervalHours: 24,
            executionsPerMonth: 30,
            alertThreshold:
              "Flag a changed normalized pricing field; require operator review of material differences.",
            estimatedPerRunCostUsd: rounded(total / 30),
            estimatedMonthlyCostUsd: total,
            schedulerEnabled: false,
          },
        }
      : {}),
    provenance: {
      isSimulated: true,
      servicesCalled: false,
      paymentsMade: false,
      note: "SIMULATED / DEMO. Provider traits and costs are modeled catalog fixtures. No service was called, no evidence was verified, and actual service spend is $0. Optional Groq decomposition is separate from service execution.",
    },
    createdAt: options.createdAt ?? "2026-08-30T00:00:00.000Z",
  });
}
export function seedRoutes(): ExecutionRouteContract[] {
  return [
    {
      objective:
        "Build a verified competitive-intelligence route for Northstar AI under $0.25.",
      budgetUsd: 0.25,
      optimizationPolicy: "most_verified" as const,
    },
    {
      objective:
        "Find the cheapest reliable service chain to turn this website into structured company data.",
      budgetUsd: 0.1,
      optimizationPolicy: "cheapest" as const,
    },
    {
      objective:
        "Design a monitored route that detects competitor pricing changes under $3/month.",
      budgetUsd: 3,
      optimizationPolicy: "best_value" as const,
    },
  ].map((input, i) => ({
    ...buildExecutionRoute({ ...input, mode: "demo" }, undefined, {
      id: `example-${i + 1}`,
    }),
    status: "simulated" as const,
  }));
}
