import "server-only";
import { snapshotCache } from "./intelligence/cache";
/** Shared expiring slots cap aggregate model admission; no visitor input stored. */
export async function admitModelCall(): Promise<boolean> {
  try {
    const cache = snapshotCache();
    if (process.env.VERCEL && cache.mode !== "shared") return false;
    for (let slot = 0; slot < 4; slot++)
    if (await cache.lease(String(slot), 20, "model-admission")) return true;
    return false;
  } catch {
    return false;
  }
}
