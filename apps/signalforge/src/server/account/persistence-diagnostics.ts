import "server-only";

type PersistenceDiagnosticEvent =
  | "forge_run_session_missing"
  | "forge_run_postgrest_rejected"
  | "forge_run_saved";

type PersistenceFailureReason =
  | "auth_error"
  | "no_authenticated_user"
  | "row_level_security"
  | "constraint_violation"
  | "conflict"
  | "network_or_timeout"
  | "unknown";

type SafePostgresCode = "23502" | "23503" | "23505" | "23514" | "42501" | "22P02";
const safePostgresCodes = new Set<SafePostgresCode>(["23502", "23503", "23505", "23514", "42501", "22P02"]);

function safePostgresCode(error: unknown): SafePostgresCode | undefined {
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return undefined;
  return safePostgresCodes.has(error.code as SafePostgresCode)
    ? error.code as SafePostgresCode
    : undefined;
}

function postgrestReason(error: unknown): PersistenceFailureReason {
  const code = safePostgresCode(error);
  if (code === "42501") return "row_level_security";
  if (code === "23505") return "conflict";
  if (code && ["23502", "23503", "23514", "22P02"].includes(code)) return "constraint_violation";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "network_or_timeout";
  return "unknown";
}

export function reportForgeRunPersistence(
  event: PersistenceDiagnosticEvent,
  details: { authError?: unknown; postgrestError?: unknown } = {},
) {
  const postgresCode = safePostgresCode(details.postgrestError);
  const payload = {
    event,
    ...(details.authError
      ? { reason: "auth_error" as const }
      : details.postgrestError
        ? { reason: postgrestReason(details.postgrestError) }
        : event === "forge_run_session_missing"
          ? { reason: "no_authenticated_user" as const }
          : {}),
    ...(postgresCode ? { postgresCode } : {}),
  };
  if (event === "forge_run_saved") console.info(JSON.stringify(payload));
  else console.warn(JSON.stringify(payload));
}
