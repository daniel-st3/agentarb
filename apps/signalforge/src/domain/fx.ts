import { z } from "zod";

export const FxObservationSchema = z
  .object({
    baseCurrency: z.literal("USDC"),
    quoteCurrency: z.literal("USD"),
    rateMicros: z.string().regex(/^[1-9][0-9]{0,17}$/),
    observedAt: z.string().datetime(),
    validUntil: z.string().datetime(),
    source: z.string().min(1).max(120),
    sourceUrl: z.string().url().nullable(),
    provenance: z.enum(["observed_market_rate", "user_scenario"]),
  })
  .strict();
export type FxObservation = z.infer<typeof FxObservationSchema>;

/** Parse a positive decimal exchange rate to exact millionths without floats. */
export function decimalRateToMicros(value: string): string | null {
  const match = value.match(/^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,6}))?$/);
  if (!match) return null;
  const micros =
    BigInt(match[1]) * 1_000_000n +
    BigInt((match[2] ?? "").padEnd(6, "0"));
  return micros > 0n ? micros.toString() : null;
}

export function usdcBaseUnitsToUsdMicros(
  amount: string,
  rateMicros: string,
  rounding: "floor" | "ceil",
) {
  const numerator = BigInt(amount) * BigInt(rateMicros);
  return (
    rounding === "ceil"
      ? (numerator + 999_999n) / 1_000_000n
      : numerator / 1_000_000n
  ).toString();
}
