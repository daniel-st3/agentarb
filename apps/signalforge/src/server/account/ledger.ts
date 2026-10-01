import "server-only";
import type { Database } from "@/lib/supabase/database";
import { SourceSynthesisResponseSchema } from "@/domain/source-synthesis";
import { hashReceipt } from "@/server/arbitrage/service";
import { readForgeSnapshot } from "./snapshot";
export type LedgerEntry = {
  id: string; title: string; createdAt: string; kind: "underwrite" | "synthesis";
  decision: string; hash: string | null; valid: boolean;
  payout: number | null; cost: number | null; ev: number | null;
  evidenceCount: number | null; sources: number | null; calls: number | null;
  usageCostMicros: string | null; blockers: string[];
};
type Tables = Database["public"]["Tables"];
type ForgeRow = Pick<Tables["forge_runs"]["Row"], "id" | "title" | "result_payload" | "receipt_hash" | "created_at">;
type SynthesisRow = Pick<Tables["source_synthesis_runs"]["Row"], "id" | "objective" | "receipt_payload" | "receipt_hash" | "created_at">;
const blanks = { payout: null, cost: null, ev: null, evidenceCount: null, sources: null, calls: null, usageCostMicros: null };
export function buildLedger(analyses: ForgeRow[], syntheses: SynthesisRow[]): LedgerEntry[] {
  return [
    ...analyses.map((row): LedgerEntry => {
      const result = readForgeSnapshot(row.result_payload, row.receipt_hash);
      const core = result?.receipt.core;
      return { ...blanks, id: row.id, title: row.title, createdAt: row.created_at, kind: "underwrite",
        valid: !!core, hash: core ? row.receipt_hash : null, decision: core?.decision ?? "unknown",
        payout: core?.scenario.payout.valueCents ?? null, cost: core?.economics.expectedTotalCostCents ?? null,
        ev: core?.economics.riskAdjustedExpectedValueCents ?? null,
        evidenceCount: core?.observedOptions.length ?? null, blockers: core?.blockers ?? [],
      };
    }),
    ...syntheses.map((row): LedgerEntry => {
      const parsed = SourceSynthesisResponseSchema.shape.receipt.safeParse(row.receipt_payload);
      const receipt = parsed.success && parsed.data.receiptHash === row.receipt_hash && hashReceipt(parsed.data.core) === row.receipt_hash ? parsed.data : null;
      return { ...blanks, id: row.id, title: receipt?.core.objective ?? row.objective, createdAt: row.created_at,
        kind: "synthesis", valid: !!receipt, hash: receipt ? row.receipt_hash : null,
        decision: receipt?.core.status ?? "unknown", sources: receipt?.core.sourceUrls.length ?? null,
        calls: receipt?.core.usage.calls ?? null, usageCostMicros: receipt?.core.cost.calculatedFromUsageUsdMicros ?? null,
        blockers: [],
      };
    }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
