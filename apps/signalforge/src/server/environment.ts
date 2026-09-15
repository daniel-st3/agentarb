import "server-only";

export const SIGNALFORGE_ENVIRONMENTS = [
  "production",
  "preview",
  "development",
  "test",
] as const;

export type SignalForgeEnvironment = (typeof SIGNALFORGE_ENVIRONMENTS)[number];

/** Resolve only trusted server runtime state; visitor input never participates. */
export function signalForgeEnvironment(
  environment: Record<string, string | undefined> = process.env,
): SignalForgeEnvironment {
  const explicit = environment.SIGNALFORGE_ENV;
  const vercel = environment.VERCEL_ENV;
  if (explicit && vercel && explicit !== vercel)
    throw new Error("signalforge_environment_conflict");
  const candidate = explicit ?? vercel;
  if (candidate) {
    if (
      SIGNALFORGE_ENVIRONMENTS.includes(candidate as SignalForgeEnvironment)
    )
      return candidate as SignalForgeEnvironment;
    throw new Error("signalforge_environment_invalid");
  }
  if (environment.VERCEL) throw new Error("signalforge_environment_missing");
  return environment.NODE_ENV === "test" ? "test" : "development";
}

export function sharedStatePrefix(
  purpose: string,
  version = "v3",
  environment: Record<string, string | undefined> = process.env,
) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(purpose))
    throw new Error("shared_state_purpose_invalid");
  if (!/^v[1-9][0-9]*$/.test(version))
    throw new Error("shared_state_version_invalid");
  return `sf:${signalForgeEnvironment(environment)}:${purpose}:${version}`;
}
