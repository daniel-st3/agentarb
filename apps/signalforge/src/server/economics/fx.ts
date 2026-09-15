import "server-only";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import {
  decimalRateToMicros,
  FxObservationSchema,
  type FxObservation,
} from "@/domain/fx";
import {
  sharedStatePrefix,
  signalForgeEnvironment,
  type SignalForgeEnvironment,
} from "../environment";
import { storeConfig } from "../store-config";
import { jsonMime, readBoundedResponseText } from "../bounded-response";

export const COINBASE_USDC_USD_SPOT =
  "https://api.coinbase.com/v2/prices/USDC-USD/spot";
const CACHE_SECONDS = 300;
const STALE_SECONDS = 600;
const MAX_BYTES = 16_384;
const PayloadSchema = z
  .object({
    data: z
      .object({
        amount: z.string().max(40),
        base: z.literal("USDC"),
        currency: z.literal("USD"),
      })
      .strict(),
  })
  .strict();

let memoryObservation: FxObservation | null = null;

export async function fetchCoinbaseFxObservation(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<FxObservation> {
  const response = await fetcher(COINBASE_USDC_USD_SPOT, {
    method: "GET",
    redirect: "error",
    credentials: "omit",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error("fx_source_unavailable");
  if (!jsonMime(response.headers.get("content-type")))
    throw new Error("fx_content_type_invalid");
  const body = await readBoundedResponseText(
    response,
    MAX_BYTES,
    "fx_payload_too_large",
  );
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    throw new Error("fx_payload_invalid");
  }
  const payload = PayloadSchema.parse(decoded);
  const rateMicros = decimalRateToMicros(payload.data.amount);
  if (!rateMicros) throw new Error("fx_rate_invalid");
  const observedAt = new Date(now).toISOString();
  return FxObservationSchema.parse({
    baseCurrency: "USDC",
    quoteCurrency: "USD",
    rateMicros,
    observedAt,
    validUntil: new Date(now + STALE_SECONDS * 1000).toISOString(),
    source: "Coinbase public spot price",
    sourceUrl:
      "https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices",
    provenance: "observed_market_rate",
  });
}

export class RedisFxObservationCache {
  private readonly environment: SignalForgeEnvironment;
  private readonly key: string;

  constructor(
    private readonly redis: Redis,
    environment: Record<string, string | undefined> = process.env,
  ) {
    this.environment = signalForgeEnvironment(environment);
    this.key = `${sharedStatePrefix("fx", "v3", {
      SIGNALFORGE_ENV: this.environment,
    })}:USDC-USD`;
  }

  async get(now: number) {
    const parsed = FxObservationSchema.safeParse(await this.redis.get(this.key));
    return parsed.success ? current(parsed.data, now) : null;
  }

  async lease() {
    return (
      (await this.redis.set(`${this.key}:lease`, "1", { nx: true, ex: 20 })) ===
      "OK"
    );
  }

  async set(observation: FxObservation) {
    await this.redis.set(this.key, FxObservationSchema.parse(observation), {
      ex: STALE_SECONDS,
    });
  }
}

function current(observation: FxObservation | null, now: number) {
  if (!observation) return null;
  const observed = Date.parse(observation.observedAt);
  if (
    !Number.isFinite(observed) ||
    observed > now + 60_000 ||
    Date.parse(observation.validUntil) < now
  )
    return null;
  return observation;
}

export async function getUsdcUsdObservation(
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<FxObservation | null> {
  try {
    if (process.env.DISCOVERY_MODE === "offline") return null;
    const configured = storeConfig();
    if (!configured) {
      const cached = current(memoryObservation, now);
      if (cached && now - Date.parse(cached.observedAt) < CACHE_SECONDS * 1000)
        return cached;
      memoryObservation = await fetchCoinbaseFxObservation(fetcher, now);
      return memoryObservation;
    }
    const cache = new RedisFxObservationCache(new Redis({
      ...configured,
      retry: false,
      signal: () => AbortSignal.timeout(2_500),
    }));
    const cached = await cache.get(now);
    if (cached && now - Date.parse(cached.observedAt) < CACHE_SECONDS * 1000)
      return cached;
    if (!(await cache.lease())) return cached;
    const observation = await fetchCoinbaseFxObservation(fetcher, now);
    await cache.set(observation);
    return observation;
  } catch {
    // FX is optional evidence. Failure is an explicit unknown, never a peg guess.
    return null;
  }
}

export function resetFxMemoryForTests() {
  memoryObservation = null;
}
