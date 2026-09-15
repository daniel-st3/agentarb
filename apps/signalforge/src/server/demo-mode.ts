import "server-only";
/** Fixtures require explicit opt-in and are impossible on Vercel production. */
export function demoDataEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.VERCEL_ENV !== "production" && env.ENABLE_DEMO_DATA === "true";
}
