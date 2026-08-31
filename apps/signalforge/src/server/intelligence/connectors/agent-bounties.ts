import { z } from "zod";
import { TaskOpportunitySchema } from "@/domain/intelligence";
import { AtomicAmountSchema } from "@/domain/real-economics";
import { capabilityIds } from "@/domain/objective";

export const agentBountiesDefinition = {
  id: "agentbounties",
  name: "Agent Bounties",
  kind: "task_marketplace",
  baseUrl: "https://api.agentbounties.app",
  accessMode: "public_read_only_api",
  termsUrl: "https://agentbounties.app/terms.html",
  refreshTtlSeconds: 600,
} as const;
const text = z
  .string()
  .max(12000)
  .refine((value) => new TextEncoder().encode(value).byteLength <= 12000);
const nullableText = text.nullable().optional();
const amount = AtomicAmountSchema.nullable().optional();
const itemSchema = z.object({
  opportunity_id: z.string().max(180),
  source_type: z.literal("canonical_base"),
  title: text,
  goal: nullableText,
  skills: z.array(z.string().max(100)).max(40),
  public_url: z.string().max(1000).url(),
  work_state: z.string().max(60),
  payment_state: z.string().max(60),
  payment_committed: z.boolean(),
  competition_mode: z.string().max(80),
  standing_meta_bounty: z.boolean(),
  verification_method: z.string().max(300),
  verification_ready: z.boolean(),
  evidence_requirements: z.unknown(),
  evidence_boundary: z.string().max(2000),
  reward: amount,
  bond: amount,
  cash_economics: z
    .object({
      solver_reward: amount,
      refundable_claim_bond: amount,
      required_external_spend: amount,
    })
    .nullable()
    .optional(),
  deadline: nullableText,
  deadline_kind: nullableText,
  created_at: z.string().max(60),
  updated_at: z.string().max(60),
});
// Discard next_action, embeds, scripts, wallet fields and unknown instruction-bearing metadata.
export const AgentBountiesProjectionSchema = z.object({
  schema_version: z.string().max(100),
  generated_at: z.string().datetime({ offset: true }),
  network: z.literal("base-mainnet"),
  degraded: z.boolean(),
  items: z.array(z.unknown()).max(30),
  evidence_boundary: z.string().max(2000),
});
export const publicText = (value: string, maximum: number) =>
  value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .slice(0, maximum);
const evidenceSchema = z.object({
  participation_phase: z.string().max(80).optional(),
  scoring_window: z
    .object({ ends_at: z.string().max(60).optional() })
    .optional(),
});
export function parseAgentBounties(raw: unknown, observedAt: string) {
  const projection = AgentBountiesProjectionSchema.parse(raw);
  if (
    projection.degraded ||
    Math.abs(Date.parse(projection.generated_at) - Date.parse(observedAt)) >
      86400000
  )
    throw new Error("invalid_payload");
  return projection.items.flatMap((entry) => {
    const result = itemSchema.safeParse(entry);
    if (!result.success) return [];
    const p = result.data,
      url = new URL(p.public_url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !["agentbounties.app", "api.agentbounties.app"].includes(url.hostname)
    )
      return [];
    const evidenceText = JSON.stringify(p.evidence_requirements ?? null);
    if (evidenceText.length > 6000) return [];
    const evidence = evidenceSchema.safeParse(p.evidence_requirements).data;
    const now = Date.parse(observedAt),
      reasons: string[] = [];
    if (p.work_state !== "claimable") reasons.push("work_not_claimable");
    if (p.payment_state !== "escrowed" || !p.payment_committed)
      reasons.push("payment_not_committed");
    if (!p.verification_ready) reasons.push("verification_not_ready");
    if (!p.deadline || !Number.isFinite(Date.parse(p.deadline)))
      reasons.push("deadline_unknown");
    else if (Date.parse(p.deadline) <= now) reasons.push("deadline_expired");
    if (
      evidence?.scoring_window?.ends_at &&
      Date.parse(evidence.scoring_window.ends_at) <= now
    )
      reasons.push("scoring_window_closed");
    if (p.standing_meta_bounty) reasons.push("funding_participation_required");
    const reward = p.cash_economics?.solver_reward ?? p.reward ?? null;
    if (!reward || BigInt(reward.amount) === 0n)
      reasons.push("reward_unknown_or_zero");
    // Only exact source capability IDs map. Description text never becomes policy/instructions.
    const capabilities = [
      ...new Set(
        p.skills.filter((s): s is (typeof capabilityIds)[number] =>
          (capabilityIds as readonly string[]).includes(s),
        ),
      ),
    ];
    return [
      TaskOpportunitySchema.parse({
        id: `agentbounties:${p.opportunity_id}`,
        sourceId: "agentbounties",
        sourceName: "Agent Bounties",
        listingType: "task_opportunity",
        title: publicText(p.title, 160),
        description: publicText(p.goal ?? "", 1400),
        requiredCapabilities: capabilities,
        payout: {
          currency: "USDC",
          parseConfidence: reward ? "exact" : "unknown",
          ...(reward
            ? {
                rawPayoutText: `${reward.amount} USDC base units (6 decimals); not a USD quote.`,
              }
            : {}),
        },
        ...(p.deadline ? { deadline: p.deadline } : {}),
        claimModel:
          p.competition_mode === "exclusive_claim" ? "open_claim" : "unknown",
        settlement: "escrow",
        actionability: "execution_not_enabled",
        constraints: [
          "Observed hosted projection, not independent chain verification.",
          "No eligibility authorization or execution is granted.",
          ...reasons,
        ],
        accessMode: "public_read_only_api",
        freshness: "live",
        observedAt,
        sourceUpdatedAt: p.updated_at,
        sourceUrl: p.public_url,
        termsUrl: agentBountiesDefinition.termsUrl,
        executionStatus: "execution_not_enabled",
        dataQuality: {
          freshnessScore: 1,
          priceConfidence: reward ? "exact" : "unknown",
          actionabilityConfidence: "observed",
          sourceTrust: "official",
          warnings: [
            "Source-reported funding; not independently verified. Gross cash headroom is not profit.",
          ],
        },
        demandState: {
          sourceType: p.source_type,
          workState: p.work_state,
          paymentState: p.payment_state,
          paymentCommitted: p.payment_committed,
          reward,
          refundableBond:
            p.cash_economics?.refundable_claim_bond ?? p.bond ?? null,
          requiredExternalSpend:
            p.cash_economics?.required_external_spend ?? null,
          verificationReady: p.verification_ready,
          verifier: publicText(p.verification_method, 300),
          evidenceRequirements: publicText(evidenceText, 6000),
          evidenceBoundary: publicText(p.evidence_boundary, 2000),
          competitionMode: p.competition_mode,
          deadlineKind: p.deadline_kind ?? null,
          scoringEndsAt: evidence?.scoring_window?.ends_at ?? null,
          participationPhase: evidence?.participation_phase ?? null,
          standingMetaBounty: p.standing_meta_bounty,
          capabilityStatus: capabilities.length ? "source_mapped" : "unknown",
          eligibility: reasons.length ? "not_eligible" : "source_ready",
          eligibilityReasons: reasons,
          projectionGeneratedAt: new Date(
            projection.generated_at,
          ).toISOString(),
          provenance: "observed_source",
        },
      }),
    ];
  });
}
