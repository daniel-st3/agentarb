/** Public, allowlisted failure categories. Never carry vendor messages or URLs. */
export type SynthesisErrorCode = "invalid_source" | "blocked_source" | "fetch_failed" | "redirect_rejected" | "content_unusable" | "provider_unavailable" | "model_failed" | "capacity_unavailable" | "duplicate_execution" | "request_invalid";

export function synthesisErrorCode(error: unknown): SynthesisErrorCode {
  const message = error instanceof Error ? error.message : "";
  if (message === "source_url_invalid" || message === "duplicate_source") return "invalid_source";
  if (["source_dns_unsafe", "source_dns_unsupported"].includes(message)) return "blocked_source";
  if (message === "source_redirect_rejected") return "redirect_rejected";
  if (["source_mime_invalid", "source_encoding_invalid", "source_payload_too_large", "source_text_insufficient", "source_input_too_large"].includes(message)) return "content_unusable";
  if (["provider_unavailable", "pricing_unavailable", "price_exceeds_authorization"].includes(message)) return "provider_unavailable";
  if (["durable_store_required", "model_capacity_unavailable"].includes(message)) return "capacity_unavailable";
  if (message === "duplicate_execution") return "duplicate_execution";
  if (message === "invalid_citation") return "model_failed";
  return "fetch_failed";
}

export class SynthesisFailure extends Error {
  constructor(readonly code: SynthesisErrorCode, readonly sourceIndex?: number) {
    super(code);
    this.name = "SynthesisFailure";
  }
}
