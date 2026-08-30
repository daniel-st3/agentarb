import "server-only";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { storeConfig } from "../store-config";
import { DiscoverySnapshotSchema } from "@/domain/intelligence";
export const CacheEntrySchema = z
  .object({
    snapshot: DiscoverySnapshotSchema.optional(),
    nextAttempt: z.number(),
    failures: z.number().int().nonnegative(),
    lastAttempt: z.string().datetime(),
    error: z.boolean(),
  })
  .strict();
export type CacheEntry = z.infer<typeof CacheEntrySchema>;
export interface SnapshotCache {
  mode: "shared" | "non_durable_demo";
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, value: CacheEntry): Promise<void>;
  lease(key: string, seconds: number): Promise<boolean>;
}
export class MemorySnapshotCache implements SnapshotCache {
  mode = "non_durable_demo" as const;
  private values = new Map<string, CacheEntry>();
  private locks = new Map<string, number>();
  async get(key: string) {
    return structuredClone(this.values.get(key) ?? null);
  }
  async set(key: string, value: CacheEntry) {
    this.values.set(key, CacheEntrySchema.parse(value));
  }
  async lease(key: string, seconds: number) {
    if ((this.locks.get(key) ?? 0) > Date.now()) return false;
    this.locks.set(key, Date.now() + seconds * 1000);
    return true;
  }
}
class RedisSnapshotCache implements SnapshotCache {
  mode = "shared" as const;
  constructor(private redis: Redis) {}
  async get(key: string) {
    const v = await this.redis.get(`sf:catalog:v1:${key}`);
    return v ? CacheEntrySchema.parse(v) : null;
  }
  async set(key: string, v: CacheEntry) {
    await this.redis.set(`sf:catalog:v1:${key}`, CacheEntrySchema.parse(v), {
      ex: 172800,
    });
  }
  async lease(key: string, seconds: number) {
    return (
      (await this.redis.set(`sf:catalog:v1:lease:${key}`, "1", {
        nx: true,
        ex: seconds,
      })) === "OK"
    );
  }
}
let cache: SnapshotCache | undefined;
export function snapshotCache(): SnapshotCache {
  if (cache) return cache;
  const configured = storeConfig();
  if (configured) {
    cache = new RedisSnapshotCache(
      new Redis({
        ...configured,
        retry: false,
        signal: () => AbortSignal.timeout(2500),
      }),
    );
  } else cache = new MemorySnapshotCache();
  return cache;
}
