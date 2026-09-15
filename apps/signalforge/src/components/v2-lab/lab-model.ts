import { z } from "zod";
import {
  CatalogServiceSchema,
  TaskOpportunitySchema,
  type CatalogService,
  type TaskOpportunity,
} from "@/domain/intelligence";

export const LabModeSchema = z.enum(["real", "unknown", "degraded", "empty"]);
export type LabMode = z.infer<typeof LabModeSchema>;

const OpportunityResponseSchema = z
  .object({
    records: z.array(TaskOpportunitySchema).max(20),
    matchedCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    executionStatus: z.literal("execution_not_enabled"),
  })
  .passthrough();

const CatalogResponseSchema = z
  .object({
    records: z.array(CatalogServiceSchema).max(50),
    executionStatus: z.literal("execution_not_enabled"),
  })
  .passthrough();

export type LabValue = {
  display: string | null;
  atomicAmount: string | null;
  currency: "USDC" | null;
  provenance: "observed_source" | "unknown" | "lab_state_simulation";
};

export type LabOption = {
  id: string;
  name: string;
  sourceName: string;
  capabilities: string[];
  freshness: CatalogService["freshness"];
  observedAt: string;
  price: string | null;
  reason: string;
  executionStatus: "execution_not_enabled";
};

export type LabObservation = {
  id: string;
  title: string;
  sourceName: string;
  observedAt: string;
  freshness: TaskOpportunity["freshness"];
  reward: LabValue;
  completeness: number;
  eligibility: "source_ready" | "not_eligible" | "unknown";
  decision: "insufficient_data" | "not_eligible";
};

export type LabSubject = LabObservation & {
  state: LabMode;
  stateLabel: "REAL OBSERVATION" | "LAB STATE SIMULATION";
  objective: string;
  capabilities: string[];
  externalSpend: LabValue;
  fulfillmentCost: LabValue;
  riskAdjustment: LabValue;
  residualValue: LabValue;
  refundableBond: LabValue;
  options: LabOption[];
  missing: string[];
  sourceUrl: string | null;
  executionStatus: "execution_not_enabled";
};

export type LabDataset = {
  mode: LabMode;
  subject: LabSubject | null;
  observations: LabObservation[];
  fetchedAt: string | null;
  matchedCount: number;
  truncated: boolean;
  error: boolean;
};

function atomic(
  value: { amount: string; currency: "USDC" } | null | undefined,
): LabValue {
  if (!value)
    return {
      display: null,
      atomicAmount: null,
      currency: null,
      provenance: "unknown",
    };
  const amount = BigInt(value.amount);
  const fraction = (amount % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return {
    display: `${amount / 1_000_000n}${fraction ? `.${fraction}` : ""} USDC`,
    atomicAmount: value.amount,
    currency: "USDC",
    provenance: "observed_source",
  };
}

const unknown = (): LabValue => ({
  display: null,
  atomicAmount: null,
  currency: null,
  provenance: "unknown",
});

function completeness(task: TaskOpportunity) {
  const state = task.demandState;
  const facts = [
    Boolean(state?.reward),
    Boolean(state?.requiredExternalSpend),
    Boolean(task.deadline),
    Boolean(state?.evidenceRequirements),
    Boolean(task.requiredCapabilities.length),
  ];
  return Math.round((facts.filter(Boolean).length / facts.length) * 100);
}

function observation(task: TaskOpportunity): LabObservation {
  const eligibility = task.demandState?.eligibility ?? "unknown";
  return {
    id: task.id,
    title: task.title,
    sourceName: task.sourceName,
    observedAt: task.observedAt,
    freshness: task.freshness,
    reward: atomic(task.demandState?.reward),
    completeness: completeness(task),
    eligibility,
    decision: eligibility === "not_eligible" ? "not_eligible" : "insufficient_data",
  };
}

function optionFor(service: CatalogService, required: string[]): LabOption {
  const overlap = service.capabilities.filter((capability) =>
    required.includes(capability),
  );
  return {
    id: service.id,
    name: service.name,
    sourceName: service.sourceName,
    capabilities: overlap,
    freshness: service.freshness,
    observedAt: service.observedAt,
    price: service.pricing.rawPriceText ?? null,
    reason:
      overlap.length === 0
        ? "capability_mismatch"
        : service.pricing.parseConfidence === "exact"
          ? "unit_price_is_not_a_task_quote"
          : "task_cost_unknown",
    executionStatus: "execution_not_enabled",
  };
}

export function normalizeRealLabData(
  tasksInput: unknown,
  servicesInput: unknown,
): LabDataset {
  const tasksResponse = OpportunityResponseSchema.parse(tasksInput);
  const servicesResponse = CatalogResponseSchema.parse(servicesInput);
  const tasks = tasksResponse.records.filter((record) =>
    ["live", "cached_live"].includes(record.freshness),
  );
  const services = servicesResponse.records.filter((record) =>
    ["live", "cached_live"].includes(record.freshness),
  );
  const observations = tasks.map(observation);
  const task = tasks.find((record) => record.demandState?.eligibility === "source_ready") ?? tasks[0];
  if (!task)
    return {
      mode: "real",
      subject: null,
      observations: [],
      fetchedAt: new Date().toISOString(),
      matchedCount: tasksResponse.matchedCount,
      truncated: tasksResponse.truncated,
      error: false,
    };
  const base = observation(task);
  const matching = services
    .map((service) => optionFor(service, task.requiredCapabilities))
    .filter((service) => service.capabilities.length > 0)
    .slice(0, 8);
  const missing = [
    ...(!task.demandState?.reward ? ["reward_unknown"] : []),
    ...(!task.demandState?.requiredExternalSpend
      ? ["required_external_spend_unknown"]
      : []),
    "task_specific_fulfillment_cost_unknown",
    "success_probability_unknown",
    ...(matching.length === 0 ? ["observed_supply_match_unknown"] : []),
  ];
  return {
    mode: "real",
    subject: {
      ...base,
      state: "real",
      stateLabel: "REAL OBSERVATION",
      objective: task.description || task.title,
      capabilities: task.requiredCapabilities,
      externalSpend: atomic(task.demandState?.requiredExternalSpend),
      fulfillmentCost: unknown(),
      riskAdjustment: unknown(),
      residualValue: unknown(),
      refundableBond: atomic(task.demandState?.refundableBond),
      options: matching,
      missing,
      sourceUrl: task.sourceUrl,
      executionStatus: "execution_not_enabled",
    },
    observations,
    fetchedAt: new Date().toISOString(),
    matchedCount: tasksResponse.matchedCount,
    truncated: tasksResponse.truncated,
    error: false,
  };
}

function simulatedValue(): LabValue {
  return {
    display: null,
    atomicAmount: null,
    currency: null,
    provenance: "lab_state_simulation",
  };
}

export function simulatedLabData(mode: Exclude<LabMode, "real">): LabDataset {
  if (mode === "empty")
    return {
      mode,
      subject: null,
      observations: [],
      fetchedAt: null,
      matchedCount: 0,
      truncated: false,
      error: false,
    };
  const degraded = mode === "degraded";
  const subject: LabSubject = {
    id: `lab-state:${mode}`,
    title: degraded ? "Stale marketplace observation" : "Unpriced agent task",
    sourceName: "LAB STATE SIMULATION",
    observedAt: degraded ? "2026-01-01T00:00:00.000Z" : "",
    freshness: degraded ? "error" : "simulated_demo",
    reward: simulatedValue(),
    completeness: degraded ? 20 : 40,
    eligibility: "unknown",
    decision: "insufficient_data",
    state: mode,
    stateLabel: "LAB STATE SIMULATION",
    objective: "Evaluate whether a bounded agent task can be underwritten.",
    capabilities: ["data_extract", "claim_verification", "synthesis"],
    externalSpend: simulatedValue(),
    fulfillmentCost: simulatedValue(),
    riskAdjustment: simulatedValue(),
    residualValue: simulatedValue(),
    refundableBond: simulatedValue(),
    options: [],
    missing: degraded
      ? ["source_freshness_expired", "economics_unavailable"]
      : ["reward_unknown", "fulfillment_cost_unknown", "risk_unknown"],
    sourceUrl: null,
    executionStatus: "execution_not_enabled",
  };
  return {
    mode,
    subject,
    observations: [subject],
    fetchedAt: null,
    matchedCount: 1,
    truncated: false,
    error: degraded,
  };
}

export async function fetchRealLabData(signal: AbortSignal) {
  const [opportunities, catalog] = await Promise.all([
    fetch("/api/v1/opportunities?mode=observed&limit=20", { signal }),
    fetch("/api/v1/catalog?listingType=service_offer&availability=observed&limit=50", {
      signal,
    }),
  ]);
  if (!opportunities.ok || !catalog.ok) throw new Error("lab_data_unavailable");
  return normalizeRealLabData(
    await opportunities.json(),
    await catalog.json(),
  );
}
