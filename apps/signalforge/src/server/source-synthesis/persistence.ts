import "server-only";

import type { Json } from "@/lib/supabase/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SourceSynthesisResponseSchema, type SourceSynthesisResponse } from "@/domain/source-synthesis";
import { hashReceipt } from "@/server/arbitrage/service";

export async function persistSourceSynthesis(raw: SourceSynthesisResponse) {
  const result = SourceSynthesisResponseSchema.parse(raw);
  const client = await createSupabaseServerClient();
  if (!client) return { status: "guest" as const, savedRunId: null };
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return { status: "guest" as const, savedRunId: null };
  if (hashReceipt(result.receipt.core) !== result.receipt.receiptHash) throw new Error("receipt_fingerprint_mismatch");
  const { data, error } = await client.from("source_synthesis_runs").insert({
    user_id: auth.user.id,
    run_id: result.receipt.core.runId,
    objective: result.receipt.core.objective,
    receipt_payload: result.receipt as unknown as Json,
    receipt_hash: result.receipt.receiptHash,
  }).select("id").single();
  if (error || !data) throw new Error("source_synthesis_save_failed");
  return { status: "saved" as const, savedRunId: data.id };
}
