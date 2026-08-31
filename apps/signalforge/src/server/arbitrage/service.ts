import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  evaluateArbitrage,
  ArbitrageInputSchema,
  ArbitrageEvaluationSchema,
} from "@/domain/arbitrage";
import { arbitrageLab, findLab } from "@/domain/arbitrage-lab";
import { networkSnapshot } from "../intelligence/service";
import { ListingSchema } from "@/domain/intelligence";
import { demoDataEnabled } from "../demo-mode";
import { realEnvelope } from "@/domain/real-economics";

export const OpportunityQuerySchema = z
  .object({
    mode: z.enum(["observed", "lab"]).default("observed"),
    query: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();
export const OpportunitiesResponseSchema = z
  .object({
    version: z.literal("2.0"),
    mode: z.enum(["observed", "lab"]),
    records: z.array(ListingSchema).max(20),
    observedSupplyCount: z.number().int().nonnegative(),
    matchedCount: z.number().int().nonnegative().optional(),
    truncated: z.boolean().optional(),
    executionStatus: z.literal("execution_not_enabled"),
  })
  .strict();
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const hashReceipt = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export const ArbitrageReceiptSchema = z
  .object({
    evaluation: ArbitrageEvaluationSchema,
    receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
    hashAlgorithm: z.literal("SHA-256/canonical-json-v1"),
  })
  .strict();
export async function searchOpportunities(raw: unknown) {
  const q = OpportunityQuerySchema.parse(raw);
  if (q.mode === "lab" && !demoDataEnabled()) throw new Error("not_found");
  const network = await networkSnapshot();
  const records =
    q.mode === "lab"
      ? arbitrageLab.map((f) => f.opportunity)
      : network.records.filter(
          (l) =>
            l.listingType === "task_opportunity" &&
            ["live", "cached_live"].includes(l.freshness),
        );
  return OpportunitiesResponseSchema.parse({
    version: "2.0",
    mode: q.mode,
    matchedCount: records.filter(
      (l) =>
        !q.query ||
        JSON.stringify(l).toLowerCase().includes(q.query.toLowerCase()),
    ).length,
    truncated:
      records.filter(
        (l) =>
          !q.query ||
          JSON.stringify(l).toLowerCase().includes(q.query.toLowerCase()),
      ).length > q.limit,
    records: records
      .filter(
        (l) =>
          !q.query ||
          JSON.stringify(l).toLowerCase().includes(q.query.toLowerCase()),
      )
      .slice(0, q.limit),
    observedSupplyCount: network.records.filter(
      (l) =>
        l.listingType === "service_offer" &&
        ["live", "cached_live"].includes(l.freshness),
    ).length,
    executionStatus: "execution_not_enabled",
  });
}
export async function underwriteOpportunity(raw: unknown) {
  const input = ArbitrageInputSchema.parse(raw),
    network = await networkSnapshot(),
    lab = demoDataEnabled() ? findLab(input.opportunityId) : undefined;
  const task =
    lab?.opportunity ??
    network.records.find(
      (l) =>
        l.id === input.opportunityId && l.listingType === "task_opportunity",
    );
  if (!task) throw new Error("not_found");
  const snapshotVersion = hashReceipt(
    network.sources.map((s) => ({
      id: s.connectorId,
      observed: s.lastSuccessAt ?? null,
    })),
  );
  const evaluation = evaluateArbitrage(task, input, {
    lab: lab?.specification,
    supply: network.records.filter((l) => l.listingType === "service_offer"),
    now: new Date().toISOString(),
    snapshotVersion,
  });
  if (task.listingType === "task_opportunity" && task.demandState) {
    const state = task.demandState;
    const supported =
      state.capabilityStatus === "source_mapped" &&
      task.requiredCapabilities.length > 0 &&
      task.requiredCapabilities.every((c) =>
        ["data_extract", "synthesis"].includes(c),
      );
    evaluation.realEconomics = realEnvelope(
      state,
      input.scenario?.workload,
      input.scenario?.successProbabilityBps,
      supported,
    );
    evaluation.decision =
      state.eligibility === "not_eligible" ? "unroutable" : "insufficient_data";
    const expired = task.deadline && Date.parse(task.deadline) <= Date.now();
    if (expired) evaluation.decision = "unroutable";
    evaluation.reasons = [
      ...new Set([
        ...evaluation.reasons.map((reason) =>
          reason === "payout_unknown" && state.reward
            ? "payout_USD_conversion_unknown"
            : reason,
        ),
        ...state.eligibilityReasons,
        ...(expired ? ["deadline_expired"] : []),
        ...(supported ? [] : ["requirements_not_supported"]),
        ...evaluation.realEconomics.missingInputs,
      ]),
    ];
    evaluation.missingInputs = evaluation.realEconomics.missingInputs;
  }
  return ArbitrageReceiptSchema.parse({
    evaluation,
    receiptHash: hashReceipt(evaluation),
    hashAlgorithm: "SHA-256/canonical-json-v1",
  });
}
