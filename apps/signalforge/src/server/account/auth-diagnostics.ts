import "server-only";

type AuthDiagnosticEvent =
  | "auth_callback_exchange_failed"
  | "auth_callback_session_established"
  | "auth_confirm_verification_failed"
  | "auth_confirm_session_established";

type AuthFailureReason =
  | "api_error"
  | "grant_exchange_failed"
  | "invalid_token_response"
  | "missing_code_verifier"
  | "network_or_timeout"
  | "unknown";

function failureReason(error: unknown): AuthFailureReason {
  if (!error || typeof error !== "object") return "unknown";
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "AuthPKCECodeVerifierMissingError") return "missing_code_verifier";
  if (name === "AuthPKCEGrantCodeExchangeError") return "grant_exchange_failed";
  if (name === "AuthInvalidTokenResponseError") return "invalid_token_response";
  if (name === "AuthRetryableFetchError" || name === "TimeoutError") return "network_or_timeout";
  if (name === "AuthApiError") return "api_error";
  return "unknown";
}

export function reportAuthCallback(
  event: AuthDiagnosticEvent,
  details: { error?: unknown; verifierCookiePresent?: boolean } = {},
) {
  const payload = {
    event,
    ...(typeof details.verifierCookiePresent === "boolean"
      ? { verifierCookiePresent: details.verifierCookiePresent }
      : {}),
    ...(details.error ? { reason: failureReason(details.error) } : {}),
  };
  if (details.error) console.warn(JSON.stringify(payload));
  else console.info(JSON.stringify(payload));
}
