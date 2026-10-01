import "server-only";
import { ForgeUnderwritingResponseSchema, evaluateForgeScenario, type ForgeUnderwritingInput } from "@/domain/forge-underwriting";
import { hashReceipt } from "@/server/arbitrage/service";

/** A checksum verifies consistency, not authorship. Never call it a signature. */
export function readForgeSnapshot(raw: unknown, expectedHash: string | null) {
  const parsed = ForgeUnderwritingResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const result = parsed.data;
  const core = result.receipt.core;
  if (result.receipt.receiptHash !== expectedHash || hashReceipt(core) !== expectedHash) return null;
  const projection = {
    scenario: result.scenario, economics: result.economics, decision: result.decision,
    financialExposure: result.financialExposure, routeEvidence: result.routeEvidence,
    blockers: result.blockers, limitations: result.limitations,
    objectiveFrame: result.planning.objectiveFrame, observedOptions: result.planning.route.observedSupply,
  };
  for (const key of Object.keys(projection) as (keyof typeof projection)[]) {
    if (hashReceipt(projection[key]) !== hashReceipt(core[key])) return null;
  }
  return result;
}

/** The guest-save proof binds the core; check every duplicated display/input field too. */
export function assertForgeSaveMatches(input: ForgeUnderwritingInput, raw: unknown, hash: string) {
  const result = readForgeSnapshot(raw, hash);
  if (!result || input.clientRunId !== result.clientRunId ||
    input.objective.objective !== result.planning.route.objective ||
    input.objective.budgetUsd !== result.planning.objectiveFrame.constraints.budgetUsd ||
    input.objective.optimizationPolicy !== result.planning.objectiveFrame.constraints.optimizationPolicy ||
    hashReceipt(evaluateForgeScenario(input, result.planning)) !== hashReceipt({
      scenario: result.scenario, routeEvidence: result.routeEvidence, economics: result.economics,
      financialExposure: result.financialExposure, decision: result.decision,
      blockers: result.blockers, limitations: result.limitations,
    })) throw new Error("saved_snapshot_mismatch");
  return result;
}
