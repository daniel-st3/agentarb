import "server-only";

import { ForgeUnderwritingInputSchema, ForgeUnderwritingResponseSchema, type ForgeUnderwritingInput, type ForgeUnderwritingResponse } from "@/domain/forge-underwriting";
import { hashReceipt } from "@/server/arbitrage/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";

export async function persistForgeRun(inputRaw: ForgeUnderwritingInput, resultRaw: ForgeUnderwritingResponse) {
  const input = ForgeUnderwritingInputSchema.parse(inputRaw);
  const result = ForgeUnderwritingResponseSchema.parse(resultRaw);
  if (!input.clientRunId || input.clientRunId !== result.clientRunId) throw new Error("run_identity_mismatch");
  if (hashReceipt(result.receipt.core) !== result.receipt.receiptHash) throw new Error("receipt_fingerprint_mismatch");
  const client = await createSupabaseServerClient();
  if (!client) return { status: "guest" as const, savedRunId: null };
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return { status: "guest" as const, savedRunId: null };

  const core = result.receipt.core;
  const storedResult = { ...result };
  delete storedResult.saveAuthorization;
  const row = {
    user_id: auth.user.id,
    idempotency_key: result.clientRunId,
    title: core.objectiveFrame.title.slice(0, 200),
    objective: input.objective.objective,
    decision: result.decision,
    request_payload: input as unknown as Json,
    result_payload: storedResult as unknown as Json,
    receipt_hash: result.receipt.receiptHash,
    receipt_schema_version: core.receiptSchemaVersion,
    economic_model_version: core.economicModelVersion,
    policy_version: core.policyVersion,
  };
  const { data, error } = await client
    .from("forge_runs")
    .upsert(row, { onConflict: "user_id,idempotency_key", ignoreDuplicates: false })
    .select("id")
    .single();
  if (error || !data) throw new Error("forge_run_save_failed");
  return { status: "saved" as const, savedRunId: data.id };
}
