export const agentBountiesDiagnosticCategories = [
  "agentbounties_http_4xx",
  "agentbounties_http_5xx",
  "agentbounties_timeout",
  "agentbounties_network_error",
  "agentbounties_redirect",
  "agentbounties_invalid_content_type",
  "agentbounties_payload_too_large",
  "agentbounties_invalid_json",
  "agentbounties_feed_schema_changed",
  "agentbounties_projection_schema_changed",
  "agentbounties_projection_degraded",
  "agentbounties_projection_stale",
] as const;

export type AgentBountiesDiagnosticCategory =
  (typeof agentBountiesDiagnosticCategories)[number];

/** Carries only a fixed diagnostic category; never upstream content. */
export class AgentBountiesDiagnosticError extends Error {
  constructor(readonly category: AgentBountiesDiagnosticCategory) {
    super("upstream_unavailable");
    this.name = "AgentBountiesDiagnosticError";
  }
}

export function agentBountiesDiagnosticCategory(error: unknown) {
  return error instanceof AgentBountiesDiagnosticError
    ? error.category
    : "agentbounties_network_error";
}
