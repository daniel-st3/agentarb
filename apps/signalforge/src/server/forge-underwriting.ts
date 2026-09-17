import "server-only";

import { ZodError } from "zod";

import {
  ForgeReceiptCoreSchema,
  ForgeUnderwritingInputSchema,
  ForgeUnderwritingResponseSchema,
  evaluateForgeScenario,
  type ForgeUnderwritingInput,
} from "@/domain/forge-underwriting";
import { readBounded } from "./http";
import { checkPlanningLimit, quotaHeaders } from "./planning-limit";
import { planRouteService } from "./route-http";
import { hashReceipt } from "./arbitrage/service";
import { randomUUID } from "node:crypto";
import { persistForgeRun } from "./account/forge-runs";
import { issueSaveAuthorization } from "./account/save-proof";

const baseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function underwriteForgeTask(
  raw: ForgeUnderwritingInput,
  signal: AbortSignal,
) {
  const input = ForgeUnderwritingInputSchema.parse(raw);
  const clientRunId = input.clientRunId ?? randomUUID();
  const planning = await planRouteService(
    input.objective,
    signal,
    undefined,
    input.locale,
    false,
  );
  const result = evaluateForgeScenario(input, planning);
  const receiptCore = ForgeReceiptCoreSchema.parse({
    receiptSchemaVersion: "forge-underwriting/1.0",
    economicModelVersion: "deterministic-cents/1.0",
    policyVersion: "forge-policy/1.0",
    objectiveFrame: planning.objectiveFrame,
    routeEvidence: result.routeEvidence,
    scenario: result.scenario,
    economics: result.economics,
    financialExposure: result.financialExposure,
    decision: result.decision,
    blockers: result.blockers,
    limitations: result.limitations,
    observedOptions: planning.route.observedSupply,
    calculationMetadata: {
      monetaryUnit: "USD_CENTS",
      catalogContextIsTaskQuote: false,
      serverAuthoritative: true,
    },
    executionStatus: "execution_not_enabled",
    servicesCalled: false,
    paymentsMade: false,
  });
  const receiptHash = hashReceipt(receiptCore);
  return ForgeUnderwritingResponseSchema.parse({
    version: "1.0",
    clientRunId,
    saveAuthorization: issueSaveAuthorization(clientRunId, receiptHash),
    planning,
    ...result,
    receipt: {
      core: receiptCore,
      receiptHash,
      hashAlgorithm: "SHA-256/canonical-json-v2",
      receiptFingerprintIsSignature: false,
    },
    executionStatus: "execution_not_enabled",
    persistence: { status: "guest", savedRunId: null },
  });
}

export async function handleForgeUnderwriting(request: Request) {
  const limited = await checkPlanningLimit(request, "underwriting");
  if (limited) return limited;
  try {
    const input = ForgeUnderwritingInputSchema.parse(await readBounded(request));
    const result = await underwriteForgeTask(input, request.signal);
    let persistence = result.persistence;
    try {
      persistence = await persistForgeRun({ ...input, clientRunId: result.clientRunId }, result);
    } catch {
      persistence = { status: "failed", savedRunId: null };
    }
    return Response.json({ ...result, persistence }, {
      headers: { ...baseHeaders, ...quotaHeaders(request) },
    });
  } catch (error) {
    const bodyTooLarge =
      error instanceof Error && error.message === "body_too_large";
    const invalidRequest = error instanceof SyntaxError || error instanceof ZodError;
    const status = bodyTooLarge ? 413 : invalidRequest ? 400 : 503;
    return Response.json(
      {
        error:
          status === 413
            ? "The underwriting request is too large."
            : status === 400
              ? "Unable to underwrite this task. Check the objective and explicit scenario assumptions."
              : "Underwriting is temporarily unavailable.",
      },
      { status, headers: { ...baseHeaders, ...quotaHeaders(request) } },
    );
  }
}
