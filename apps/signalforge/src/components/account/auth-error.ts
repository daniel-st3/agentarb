export type AuthRequestFailure = "rate_limited" | "delivery_restricted" | "configuration" | "unavailable";

type SafeAuthError = {
  code?: string;
  status?: number;
};

export function classifyAuthRequestFailure(error: SafeAuthError): AuthRequestFailure {
  const code = error.code?.toLowerCase() ?? "unknown";
  if (error.status === 429 || code.includes("rate_limit")) return "rate_limited";
  if (code === "email_address_not_authorized") return "delivery_restricted";
  if (code === "invalid_api_key" || code === "bad_jwt" || error.status === 401) return "configuration";
  return "unavailable";
}

export function reportAuthRequestFailure(operation: "email_otp" | "google_oauth", error: SafeAuthError) {
  const failure = classifyAuthRequestFailure(error);
  console.warn("signalforge.auth.request_failed", JSON.stringify({
    operation,
    failure,
    code: error.code ?? "unknown",
    status: error.status ?? null,
  }));
  return failure;
}
