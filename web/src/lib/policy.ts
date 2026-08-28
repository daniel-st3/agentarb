import {
  CATEGORIES,
  CORE_CAPABILITIES,
  PACKAGE_PREVIEW_CONSTANTS,
  REQUIRED_PROHIBITIONS,
  TOOLS,
  policyEnvelopeSchema,
  type EvaluationRow,
  type Opportunity,
  type PolicyEnvelope,
} from "./contracts";

// Generated from the existing Python hosted engine; parity tests detect drift.
import rules from "./generated-policy.json";

const BASE = rules.heuristic_base;
const CONTROL_PATTERNS = rules.control_patterns.map(
  ([pattern, label]) =>
    [new RegExp(pattern, "i"), label.toUpperCase()] as const,
);
const HARMFUL_PATTERNS = rules.harmful_patterns.map(
  ([pattern, label]) => [new RegExp(pattern, "i"), label] as const,
);
const OUT_OF_SCOPE = rules.scope_patterns.map(
  ([pattern, label]) => [new RegExp(pattern, "i"), label] as const,
);

function safety(
  opportunity: Opportunity,
): { code: string; rationale: string } | null {
  const text =
    `${opportunity.title}\n${opportunity.description}\n${(opportunity.tags ?? []).join(" ")}`.toLowerCase();
  for (const [pattern, label] of CONTROL_PATTERNS) {
    if (pattern.test(text)) {
      return {
        code: `PROHIBITED_${label}`,
        rationale: `Refused by the worker profile’s prohibited-action boundary: ${label.toLowerCase().replaceAll("_", " ")}.`,
      };
    }
  }
  if (
    !CATEGORIES.includes(opportunity.category as (typeof CATEGORIES)[number])
  ) {
    return {
      code: "SAFETY_UNSUPPORTED",
      rationale: `No bounded handler supports ${opportunity.category} tasks.`,
    };
  }
  for (const [pattern, label] of HARMFUL_PATTERNS) {
    if (pattern.test(text))
      return { code: "SAFETY_HARMFUL", rationale: `Refused: ${label}.` };
  }
  for (const [pattern, label] of OUT_OF_SCOPE) {
    if (pattern.test(text))
      return {
        code: "SAFETY_OUT_OF_SCOPE",
        rationale: `Out of scope: ${label}.`,
      };
  }
  if (opportunity.description.trim().length < 40) {
    return {
      code: "SAFETY_AMBIGUOUS",
      rationale: `Too underspecified to evaluate honestly (${opportunity.description.trim().length} description characters).`,
    };
  }
  if (
    rules.vague_patterns.some((pattern) =>
      new RegExp(pattern, "i").test(opportunity.description),
    )
  ) {
    return {
      code: "SAFETY_AMBIGUOUS",
      rationale: "Description is a placeholder, not a specification.",
    };
  }
  return null;
}

function estimate(opportunity: Opportunity) {
  let [feasibility, pSuccess, effortHours] = [...BASE[opportunity.category]];
  const text = `${opportunity.title} ${opportunity.description}`.toLowerCase();
  const flags = rules.heuristic_flags.filter((flag) => text.includes(flag));
  if (flags.length) {
    feasibility *= 0.25;
    pSuccess *= 0.3;
    effortHours *= 4;
  }
  const scales = [
    ...text.matchAll(new RegExp(rules.heuristic_scale_pattern, "g")),
  ].map((match) => Number(match[1]));
  const scale = Math.max(0, ...scales);
  if (scale >= 100) effortHours *= 3;
  else if (scale >= 20) effortHours *= 1.8;
  if (opportunity.description.length < 40) pSuccess *= 0.7;
  const confidence = opportunity.description.length < 40 ? 0.35 : 0.6;
  const adjustedConfidence =
    opportunity.payoutUsd === null ? confidence * 0.6 : confidence;
  return {
    feasibility,
    pSuccess: Number(pSuccess.toFixed(3)),
    confidence: Number(adjustedConfidence.toFixed(3)),
    effortHours: Number(effortHours.toFixed(3)),
    executionCost: Number((0.35 * effortHours + 0.01).toFixed(4)),
    otherCost: 0,
  };
}

export function evaluateOpportunity(
  opportunity: Opportunity,
  envelope: PolicyEnvelope,
): EvaluationRow {
  const base = {
    ...opportunity,
    actual_llm_inference_cost_usd: 0 as const,
    actual_llm_cost_status: "no_llm_call" as const,
    external_execution_status: "discovery_only" as const,
    estimator: "deterministic_heuristic_v1" as const,
  };
  const stop = safety(opportunity);
  if (stop) return result(base, "refuse", stop.code, stop.rationale);
  if (!envelope.policy.allowedMarketplaces.includes(opportunity.marketplace)) {
    return result(
      base,
      "skip",
      "MARKETPLACE_NOT_ALLOWED",
      `${label(opportunity.marketplace)} is not allowed by this session policy.`,
    );
  }
  if (
    !envelope.profile.supportedCategories.includes(
      opportunity.category as never,
    )
  ) {
    return result(
      base,
      "skip",
      "CATEGORY_NOT_SUPPORTED",
      `The worker profile does not support ${label(opportunity.category)}.`,
      false,
    );
  }
  const missingCapabilities = opportunity.requiredCapabilities.filter(
    (capability) =>
      !envelope.profile.capabilities.includes(capability as never),
  );
  if (missingCapabilities.length) {
    return result(
      base,
      "skip",
      "CAPABILITY_NOT_SUPPORTED",
      `Missing required capabilities: ${missingCapabilities.join(", ")}.`,
      false,
    );
  }
  if (opportunity.requiredReputation > 0) {
    return result(
      base,
      "skip",
      "REPUTATION_INSUFFICIENT",
      `Required reputation ${opportunity.requiredReputation} exceeds configured reputation 0.`,
    );
  }
  if (TOOLS.some((tool) => !envelope.profile.allowedTools.includes(tool))) {
    return result(
      base,
      "skip",
      "LOCAL_CAPABILITY_MISSING",
      `A bounded preview requires ${TOOLS.join(" and ")}.`,
    );
  }
  if (
    CORE_CAPABILITIES.some(
      (capability) => !envelope.profile.capabilities.includes(capability),
    )
  ) {
    return result(
      base,
      "skip",
      "LOCAL_CAPABILITY_MISSING",
      "Local planning, validation, and structured output are required.",
    );
  }
  if (
    envelope.profile.prohibitedActions.includes("code_planning") &&
    opportunity.category === "small_code"
  ) {
    return result(
      base,
      "skip",
      "SESSION_CODE_PLANNING_BLOCKED",
      "This session prohibits code planning.",
    );
  }
  if (
    envelope.profile.prohibitedActions.includes("external_source_dependency") &&
    opportunity.category === "research"
  ) {
    return result(
      base,
      "skip",
      "SESSION_SOURCE_DEPENDENCY_BLOCKED",
      "This session excludes work with external evidence requirements.",
    );
  }
  const prediction = estimate(opportunity);
  const payout = opportunity.payoutUsd;
  const margin =
    payout === null
      ? 0
      : payout * prediction.pSuccess - prediction.executionCost;
  const details = {
    confidence: prediction.confidence,
    pSuccess: prediction.pSuccess,
    estimatedDurationMinutes: prediction.effortHours * 60,
    estimated_task_execution_cost_usd: prediction.executionCost,
    estimated_other_cost_usd: 0,
    expected_margin_usd: margin,
  };
  if (payout === null)
    return result(
      base,
      "skip",
      "PAYOUT_UNKNOWN",
      "Payout is not machine-readable.",
      true,
      details,
    );
  if (payout < envelope.policy.minPayoutUsd)
    return result(
      base,
      "skip",
      "PAYOUT_BELOW_POLICY",
      `Payout $${payout.toFixed(2)} is below the $${envelope.policy.minPayoutUsd.toFixed(2)} minimum.`,
      true,
      details,
    );
  if (prediction.confidence < envelope.policy.minConfidence)
    return result(
      base,
      "skip",
      "CONFIDENCE_BELOW_POLICY",
      `Confidence ${prediction.confidence.toFixed(2)} is below the ${envelope.policy.minConfidence.toFixed(2)} minimum.`,
      true,
      details,
    );
  if (prediction.effortHours * 60 > envelope.profile.maxExecutionMinutes)
    return result(
      base,
      "skip",
      "TIME_EXCEEDS_PROFILE",
      `Projected duration ${(prediction.effortHours * 60).toFixed(1)} minutes exceeds the profile maximum.`,
      true,
      details,
    );
  if (prediction.executionCost > envelope.profile.maxExecutionCostUsd)
    return result(
      base,
      "skip",
      "COST_EXCEEDS_PROFILE",
      `Projected execution cost $${prediction.executionCost.toFixed(4)} exceeds the profile maximum.`,
      true,
      details,
    );
  if (margin < envelope.policy.minExpectedMarginUsd)
    return result(
      base,
      "skip",
      "EXPECTED_MARGIN_BELOW_POLICY",
      `Projected expected margin $${margin.toFixed(2)} is below the policy minimum.`,
      true,
      details,
    );
  if (prediction.executionCost > 5)
    return result(
      base,
      "skip",
      "PROJECTED_DAILY_COST_EXCEEDED",
      "Projected execution cost exceeds the fixed $5 daily policy ceiling.",
      true,
      details,
    );
  return result(
    base,
    "allow",
    "POLICY_PASSED",
    "Opportunity passed safety, capability, and session policy checks.",
    true,
    details,
  );
}

function result(
  base: Omit<
    EvaluationRow,
    | "packageEligibility"
    | "reasonCodes"
    | "rationale"
    | "confidence"
    | "pSuccess"
    | "estimatedDurationMinutes"
    | "estimated_task_execution_cost_usd"
    | "estimated_other_cost_usd"
    | "expected_margin_usd"
    | "capabilityMatch"
    | "estimateAvailable"
  >,
  eligibility: EvaluationRow["packageEligibility"],
  code: string,
  rationale: string,
  capabilityMatch: boolean | null = null,
  detail: Partial<EvaluationRow> = {},
): EvaluationRow {
  return {
    ...base,
    packageEligibility: eligibility,
    reasonCodes: [code],
    rationale,
    confidence: 0,
    pSuccess: 0,
    estimatedDurationMinutes: 0,
    estimated_task_execution_cost_usd: 0,
    estimated_other_cost_usd: 0,
    expected_margin_usd: 0,
    capabilityMatch,
    estimateAvailable: Object.hasOwn(detail, "confidence"),
    ...detail,
  };
}

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const PLAN = {
  research:
    "Produce a question matrix, evidence requirements, uncertainty notes, and a source plan.",
  summarization:
    "Create a structured outline using only the text supplied with the opportunity.",
  data_lookup:
    "Define an extraction schema, field map, provenance requirements, and unresolved inputs.",
  small_code:
    "Create pseudocode, a bounded patch outline, and a test strategy without executing code.",
  unknown: "No plan is available.",
} as const;

export function createPackagePreview(
  row: EvaluationRow,
  envelope: PolicyEnvelope,
) {
  policyEnvelopeSchema.parse(envelope);
  if (row.packageEligibility !== "allow")
    throw new Error("Only allowed decisions can be previewed.");
  if (evaluateOpportunity(row, envelope).packageEligibility !== "allow") {
    throw new Error("Preview no longer satisfies the evaluated policy.");
  }
  return {
    ...PACKAGE_PREVIEW_CONSTANTS,
    workerProfileSnapshot: envelope.profile,
    policySnapshot: envelope.policy,
    task: {
      title: row.title,
      description: row.description,
      category: row.category,
      marketplace: row.marketplace,
      payoutUsd: row.payoutUsd,
    },
    deterministicPlan: [
      "Normalize and structure the supplied task specification.",
      PLAN[row.category],
      "Validate structured output and confirm no external action was taken.",
    ],
    validationCriteria: [
      "Structured output is present.",
      "No external action, marketplace write, credential use, payment, or code execution occurs.",
      ...(row.category === "small_code" ? ["A test strategy is present."] : []),
    ],
    safetyConstraints: {
      humanApprovalRequired: true,
      executionAuthorized: false,
      allowedTools: envelope.profile.allowedTools,
      prohibitedActions: envelope.profile.prohibitedActions,
    },
    reasonForAllowance: row.rationale,
    refusalConditions: [
      "Any need for credentials, payments, wallets, signing, login, private data, or marketplace action.",
      "Any policy threshold or required capability is not satisfied.",
      "The task becomes ambiguous, harmful, unsupported, or dependent on arbitrary code execution.",
    ],
    costAccounting: {
      actual_llm_inference_cost_usd: row.actual_llm_inference_cost_usd,
      actual_llm_cost_status: row.actual_llm_cost_status,
      estimated_task_execution_cost_usd: row.estimated_task_execution_cost_usd,
      estimated_other_cost_usd: row.estimated_other_cost_usd,
      expected_margin_usd: row.expected_margin_usd,
    },
  };
}

export const PERSISTENCE_SURFACE = Object.freeze([] as string[]);
export const MARKETPLACE_WRITE_ROUTES = Object.freeze([] as string[]);
export const REQUIRED_SAFETY_PROHIBITIONS = REQUIRED_PROHIBITIONS;
