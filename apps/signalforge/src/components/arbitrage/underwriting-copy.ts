/** Display prose only. Codes remain stable in the machine receipt. */
export const underwritingReasons: Record<string, string> = {
  deadline_expired: "The submission deadline has passed.",
  deadline_unknown: "The source does not provide a usable submission deadline.",
  scoring_window_closed:
    "The scoring window has closed, even if the listing remains visible.",
  payment_not_committed: "The source has not reported a committed payment.",
  verification_not_ready:
    "The source has not confirmed that verification is ready.",
  funding_participation_required:
    "Participation requires funding activity outside SignalForge’s permitted scope.",
  requirements_not_supported:
    "The complete task cannot be mapped to a supported fulfillment route.",
  complete_fulfillment_scope:
    "A complete, bounded fulfillment specification is still needed.",
  platform_and_verification_costs:
    "Platform, verification and other fulfillment fees are not fully known.",
  actual_eligibility:
    "The source’s funding and eligibility statements require independent confirmation.",
  USDC_USD_conversion_not_assumed:
    "The USDC reward and USD provider prices have not been converted or combined.",
  payout_USD_conversion_unknown:
    "The reward is known in USDC; a USD exchange assumption has not been supplied.",
  success_probability:
    "There is no measured probability of winning or completing this work.",
  bounded_provider_workload:
    "A supported task and explicit token/call limits are needed for a provider cost ceiling.",
};
