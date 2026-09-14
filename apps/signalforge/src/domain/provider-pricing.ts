import { z } from "zod";

const MoneyIntegerSchema = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);

export const ProviderPricingSchema = z
  .object({
    provider: z.string().min(1).max(80),
    modelId: z.string().min(1).max(160),
    observedAt: z.string().datetime(),
    validUntil: z.string().datetime(),
    inputUnit: z.literal("million_tokens"),
    inputPriceUsdMicros: MoneyIntegerSchema,
    outputUnit: z.literal("million_tokens"),
    outputPriceUsdMicros: MoneyIntegerSchema,
    sourceUrl: z.string().url(),
    provenance: z.literal("published_provider_price"),
  })
  .strict();
export type ProviderPricing = z.infer<typeof ProviderPricingSchema>;
export const ProviderPricingStatusSchema = z.enum([
  "current",
  "expiring_soon",
  "expired",
  "unknown",
]);
export type ProviderPricingStatus = z.infer<typeof ProviderPricingStatusSchema>;

/**
 * Reviewed first-party price snapshot. Runtime scraping is intentionally absent.
 * A stale record is unusable until this reviewed table is refreshed.
 */
export const REVIEWED_PROVIDER_PRICES: readonly ProviderPricing[] = [
  ProviderPricingSchema.parse({
    provider: "Groq",
    modelId: "openai/gpt-oss-20b",
    observedAt: "2026-09-14T00:00:00.000Z",
    validUntil: "2026-10-14T00:00:00.000Z",
    inputUnit: "million_tokens",
    inputPriceUsdMicros: "75000",
    outputUnit: "million_tokens",
    outputPriceUsdMicros: "300000",
    sourceUrl: "https://console.groq.com/docs/model/openai/gpt-oss-20b",
    provenance: "published_provider_price",
  }),
];

export function currentProviderPrice(
  provider: string,
  modelId: string,
  now = Date.now(),
): ProviderPricing | null {
  const record = REVIEWED_PROVIDER_PRICES.find(
    (price) => price.provider === provider && price.modelId === modelId,
  );
  if (
    !record ||
    Date.parse(record.observedAt) > now + 60_000 ||
    Date.parse(record.validUntil) < now
  )
    return null;
  return record;
}

export function providerPricingStatus(
  provider: string,
  modelId: string,
  now = Date.now(),
): ProviderPricingStatus {
  const record = REVIEWED_PROVIDER_PRICES.find(
    (price) => price.provider === provider && price.modelId === modelId,
  );
  if (!record || Date.parse(record.observedAt) > now + 60_000) return "unknown";
  const validUntil = Date.parse(record.validUntil);
  if (!Number.isFinite(validUntil)) return "unknown";
  if (validUntil < now) return "expired";
  return validUntil - now <= 7 * 24 * 60 * 60 * 1000
    ? "expiring_soon"
    : "current";
}

export function calculateProviderCostCeiling(
  workload: {
    maxInputTokens: number;
    maxOutputTokens: number;
    boundedCalls: number;
  },
  price: ProviderPricing,
) {
  const numerator =
    (BigInt(workload.maxInputTokens) * BigInt(price.inputPriceUsdMicros) +
      BigInt(workload.maxOutputTokens) * BigInt(price.outputPriceUsdMicros)) *
    BigInt(workload.boundedCalls);
  return ((numerator + 999999n) / 1000000n).toString();
}
