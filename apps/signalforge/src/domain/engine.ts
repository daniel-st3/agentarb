import { providers, type ServiceProviderConnector } from "./providers";
import { topics, topicFor, fixtureDate } from "./fixtures";
import {
  requestInputSchema,
  ResearchRequestSchema,
  ExecutionPlanSchema,
  RunSchema,
  type ResearchRequest,
  type ServiceOffer,
  type Alternative,
  type ExecutionPlan,
  type EvidenceItem,
  type Claim,
  type Run,
  type RequestInput,
} from "./schema";

const cents = (value: number) => Math.round(value * 100);
const dollars = (value: number) => value / 100;
export const policyLabels = {
  best_value: "Best value",
  cheapest: "Cheapest",
  most_verified: "Most verified",
  fastest: "Fastest",
};
export const provenanceNotice =
  "Simulation only. All findings use authored fictional fixtures, not live research. Prices are modeled; actual service spend is $0. No payments or external provider calls.";

type Route = {
  offers: ServiceOffer[];
  cost: number;
  quality: number;
  latency: number;
  diversity: number;
  score: number;
};
export function buildPlan(
  request: ResearchRequest,
  offers: ServiceOffer[],
): ExecutionPlan {
  const hasEvidenceCase = Boolean(topicFor(request.question));
  const eligible = offers.filter(
    (o) =>
      o.isEnabled &&
      !o.requiresApiKey &&
      o.providerType === "mock" &&
      o.reliabilityScore >= 0.8 &&
      o.qualityScore >= 0.7,
  );
  const researchers = eligible.filter((o) =>
    o.capabilities.includes("web_research"),
  );
  const synthesizer = eligible.find((o) =>
    o.capabilities.includes("synthesis"),
  );
  const verifiers = eligible.filter(
    (o) => hasEvidenceCase && o.capabilities.includes("claim_verification"),
  );
  if (!synthesizer) throw new Error("No safe route is available.");
  const routes: Route[] = [];
  for (const research of researchers) {
    for (const verifier of [undefined, ...verifiers]) {
      const selected = [research, ...(verifier ? [verifier] : []), synthesizer];
      const cost = selected.reduce(
        (total, o) => total + cents(o.pricePerCallUsd),
        0,
      );
      if (cost > cents(request.budgetUsd)) continue;
      const quality =
        selected.reduce(
          (total, o) => total + o.qualityScore * o.reliabilityScore,
          0,
        ) / selected.length;
      const latency = selected.reduce(
        (total, o) => total + o.estimatedLatencySeconds,
        0,
      );
      const diversity = verifier ? 1 : 0.25;
      const costRatio = cost / Math.max(cents(request.budgetUsd), 1);
      const verified = request.optimizationPolicy === "most_verified";
      const score =
        (verified ? 0.35 : 0.48) * quality +
        (verified ? 0.55 : 0.27) * diversity -
        (verified ? 0.07 : 0.18) * costRatio -
        ((verified ? 0.03 : 0.07) * latency) / 20;
      routes.push({
        offers: selected,
        cost,
        quality,
        latency,
        diversity,
        score,
      });
    }
  }
  routes.sort((a, b) => {
    if (request.optimizationPolicy === "cheapest")
      return a.cost - b.cost || b.quality - a.quality;
    if (request.optimizationPolicy === "fastest")
      return a.latency - b.latency || b.quality - a.quality;
    return b.score - a.score || a.cost - b.cost;
  });
  const route = routes[0];
  if (!route) throw new Error("No safe route fits this budget.");
  const selectedIds = new Set(route.offers.map((o) => o.providerId));
  const alternatives: Alternative[] = offers
    .filter((o) => !selectedIds.has(o.providerId))
    .map((o) => {
      let code: Alternative["code"] = "lower_policy_score";
      let reason = `Another eligible route better fits the ${policyLabels[request.optimizationPolicy].toLowerCase()} policy.`;
      if (o.providerType === "x402_catalog_only") {
        code = "catalog_only";
        reason = "Catalog metadata only; execution is unavailable.";
      } else if (o.requiresApiKey) {
        code = "missing_configuration";
        reason = "No live adapter is configured; no external service can run.";
      } else if (!o.isEnabled) {
        code = "unavailable";
        reason = "Provider is unavailable.";
      } else if (o.reliabilityScore < 0.8 || o.qualityScore < 0.7) {
        code = "low_reliability";
        reason = "Below the minimum quality or reliability threshold.";
      } else if (
        !hasEvidenceCase &&
        o.capabilities.includes("claim_verification")
      ) {
        code = "low_capability_fit";
        reason =
          "No matching fixture evidence is available to corroborate. Verification is not needed.";
      } else if (
        !o.capabilities.some((c) =>
          ["web_research", "claim_verification", "synthesis"].includes(c),
        )
      ) {
        code = "low_capability_fit";
        reason = "Does not supply a required route capability.";
      } else {
        const replacement = route.offers.find((s) =>
          s.capabilities.some((c) => o.capabilities.includes(c)),
        );
        const alternativeCost =
          route.cost -
          (replacement ? cents(replacement.pricePerCallUsd) : 0) +
          cents(o.pricePerCallUsd);
        if (alternativeCost > cents(request.budgetUsd)) {
          code = "would_exceed_budget";
          reason =
            "Including this provider would exceed the hard modeled budget.";
        }
      }
      return { providerId: o.providerId, name: o.name, code, reason };
    });
  const evidenceExplanation = !hasEvidenceCase
    ? "This question is outside the fixture cases. The route will return an evidence-gap brief, not a researched answer."
    : route.diversity === 1
      ? "An independently modeled review source cross-checks the two substantive claims."
      : "The route uses one source family; claims will remain single-source.";
  const explanation = `${policyLabels[request.optimizationPolicy]} selects ${route.offers.length} local demo services at a modeled cost of $${dollars(route.cost).toFixed(2)}, within the $${request.budgetUsd.toFixed(2)} cap. ${evidenceExplanation} Actual spend is $0.`;
  return ExecutionPlanSchema.parse({
    requestId: request.id,
    budgetUsd: request.budgetUsd,
    estimatedTotalCostUsd: dollars(route.cost),
    expectedQualityScore: route.quality,
    expectedLatencySeconds: route.latency,
    policy: request.optimizationPolicy,
    planningExplanation: explanation,
    catalogVersion: "v1",
    simulationOnly: true,
    steps: route.offers.map((o, i) => ({
      stepId: `step-${i + 1}`,
      capabilityNeeded:
        i === 0
          ? "web_research"
          : o.capabilities.includes("claim_verification")
            ? "claim_verification"
            : "synthesis",
      selectedProviderId: o.providerId,
      alternativesConsidered: i === 0 ? alternatives : [],
      reasonSelected:
        i === 0
          ? hasEvidenceCase
            ? "Supplies the topic's bounded company evidence at the selected policy's best tradeoff."
            : "Checks the bounded fixture library and records that matching evidence is unavailable."
          : o.capabilities.includes("claim_verification")
            ? "Adds a separately modeled publisher and provider for independent corroboration."
            : "Structures supplied evidence or evidence gaps into a brief without an LLM call.",
      estimatedCostUsd: o.pricePerCallUsd,
      actualCostUsd: 0,
      status: "planned",
      outputReference: null,
    })),
  });
}

export function verifyClaim(
  id: string,
  text: string,
  importance: "high" | "medium",
  sources: EvidenceItem[],
): Claim {
  const matching = sources.filter((e) => e.claimId === id);
  // Both publisher independence AND provider independence are required. Mirrors
  // real-source requirements, but does not convert fixture evidence into reality.
  const independent = matching.some((a, i) =>
    matching
      .slice(i + 1)
      .some(
        (b) =>
          a.independentSourceId !== b.independentSourceId &&
          a.providerId !== b.providerId,
      ),
  );
  return {
    id,
    text,
    importance,
    confidence: independent ? 0.84 : matching.length ? 0.6 : 0,
    verificationStatus: independent
      ? "corroborated_in_simulation"
      : matching.length
        ? "single_source"
        : "unverified",
    evidenceIds: matching.map((e) => e.id),
    provenanceLabel: "Simulated demo evidence",
  };
}
export async function createPlan(
  input: RequestInput,
  id: string,
  at = new Date().toISOString(),
): Promise<Run> {
  const parsed = requestInputSchema.parse(input);
  const request = ResearchRequestSchema.parse({
    ...parsed,
    id,
    createdAt: at,
    status: "planned",
  });
  const connectors = providers();
  const offers = await Promise.all(
    connectors.map(async (p) => ({
      ...p.offer(),
      isEnabled: await p.isAvailable(),
    })),
  );
  return RunSchema.parse({
    schemaVersion: "v1",
    request,
    offers,
    plan: buildPlan(request, offers),
    example: false,
    audit: ["validate_request", "discover_offers", "build_plan"].map(
      (state) => ({ state, at }),
    ),
  });
}
export async function executeRun(
  request: ResearchRequest,
  consent: true,
  clock = () => new Date().toISOString(),
): Promise<Run> {
  if (consent !== true) throw new Error("Explicit run consent is required.");
  const parsed = ResearchRequestSchema.parse(request);
  // Recompute instead of trusting client-supplied offers, costs, or plans.
  const run = await createPlan(
    {
      question: parsed.question,
      targetUrl: parsed.targetUrl,
      budgetUsd: parsed.budgetUsd,
      optimizationPolicy: parsed.optimizationPolicy,
    },
    parsed.id,
    parsed.createdAt,
  );
  const started = performance.now();
  const sources: EvidenceItem[] = [];
  const registry = new Map(
    providers()
      .filter((p) => p.offer().providerType === "mock")
      .map((p) => [p.id, p]),
  );
  const audit = [...run.audit, { state: "user_clicks_run", at: clock() }];
  let modeledCents = 0;
  for (const step of run.plan.steps) {
    const provider: ServiceProviderConnector | undefined = registry.get(
      step.selectedProviderId,
    );
    if (!provider || !(await provider.isAvailable()))
      throw new Error("Unsafe provider route.");
    const nextCost = cents(provider.offer().pricePerCallUsd);
    if (modeledCents + nextCost > cents(run.request.budgetUsd))
      throw new Error("Budget exceeded.");
    const result = await provider.execute({
      request: parsed,
      capability: step.capabilityNeeded,
      at: clock(),
    });
    if (
      result.actualCostUsd !== 0 ||
      cents(result.simulatedCostUsd) !== nextCost
    )
      throw new Error("Unexpected provider cost.");
    modeledCents += nextCost;
    sources.push(...result.evidence);
    step.status = "complete";
    step.outputReference = `local:${step.stepId}`;
    audit.push({ state: `execute_steps:${step.stepId}`, at: clock() });
  }
  const topic = topicFor(parsed.question);
  const claims = topic
    ? topic.findings.map((finding, i) =>
        verifyClaim(
          `claim-${i}`,
          finding[0],
          i < 2 ? "high" : "medium",
          sources,
        ),
      )
    : [
        verifyClaim(
          "unresolved",
          "No matching demo evidence is available for this question.",
          "high",
          [],
        ),
      ];
  const title = topic
    ? `Intelligence brief: ${topic.name}`
    : "Research brief: evidence unavailable";
  const executiveSummary =
    topic?.answer ??
    "This question is outside the three fictional demo cases. No external research was performed, so a substantive answer would be unsupported. Use an example case to inspect the complete evidence workflow.";
  const unknowns = [
    ...(topic?.unknowns ?? [
      "The question needs real source retrieval and independent validation.",
    ]),
    ...(parsed.targetUrl
      ? ["The supplied target URL was not fetched or verified."]
      : []),
    "All evidence is simulated. Do not use this brief for a real-world decision.",
  ];
  const markdown = [
    `# ${title}`,
    "",
    "> Simulated demo evidence · fictional case · actual spend $0",
    "",
    "## The answer",
    executiveSummary,
    "",
    "## Key findings",
    ...claims.flatMap((c) => [
      `- ${c.text} [${c.verificationStatus}]`,
      ...c.evidenceIds.map((id) => `  - [${id}](#${id})`),
    ]),
    "",
    "## What remains uncertain",
    ...unknowns.map((u) => `- ${u}`),
    "",
    "## Evidence ledger",
    ...sources.flatMap((e) => [
      `### ${e.id}`,
      `${e.sourceTitle} — ${e.providerId}`,
      e.excerpt,
      `Simulated demo evidence. Materialized ${e.retrievedAt}. No public URL.`,
      "",
    ]),
    "## Receipt",
    `Budget: $${parsed.budgetUsd.toFixed(2)}; modeled cost: $${dollars(modeledCents).toFixed(2)}; actual spend: $0.00.`,
    provenanceNotice,
  ].join("\n");
  for (const state of [
    "extract_claims",
    "verify_key_claims",
    "synthesize_brief",
    "build_receipt",
    "complete",
  ])
    audit.push({ state, at: clock() });
  return RunSchema.parse({
    ...run,
    request: { ...parsed, status: "complete" },
    audit,
    brief: {
      requestId: parsed.id,
      title,
      executiveSummary,
      keyFindings: claims.map((c) => c.text),
      risksAndUnknowns: unknowns,
      claims,
      sources,
      markdownContent: markdown,
      createdAt: clock(),
    },
    receipt: {
      requestId: parsed.id,
      budgetUsd: parsed.budgetUsd,
      estimatedSpendUsd: run.plan.estimatedTotalCostUsd,
      actualSpendUsd: 0,
      simulatedSpendUsd: dollars(modeledCents),
      providerBreakdown: run.plan.steps.map((step) => ({
        providerId: step.selectedProviderId,
        name: run.offers.find((o) => o.providerId === step.selectedProviderId)!
          .name,
        provenance: "Mock",
        estimatedCostUsd: step.estimatedCostUsd,
        actualCostUsd: 0,
        simulatedCostUsd: step.estimatedCostUsd,
      })),
      rejectedAlternatives: run.plan.steps.flatMap(
        (s) => s.alternativesConsidered,
      ),
      elapsedSeconds: Math.max(0, (performance.now() - started) / 1000),
      sourceCount: new Set(
        sources.map(
          (source) => `${source.independentSourceId}:${source.sourceTitle}`,
        ),
      ).size,
      evidenceItemCount: sources.length,
      verifiedClaimCount: claims.filter(
        (c) => c.verificationStatus === "corroborated_in_simulation",
      ).length,
      provenanceNotice,
    },
  });
}
export async function seedRuns(): Promise<Run[]> {
  return Promise.all(
    topics.map(async (topic, i) => {
      const run = await executeRun(
        {
          id: `example-${i + 1}`,
          question: topic.question,
          budgetUsd: i === 1 ? 0 : 0.25,
          optimizationPolicy: i === 1 ? "cheapest" : "most_verified",
          createdAt: fixtureDate,
          status: "planned",
        },
        true,
        () => fixtureDate,
      );
      return {
        ...run,
        example: true,
        receipt: { ...run.receipt!, elapsedSeconds: 0 },
      };
    }),
  );
}
