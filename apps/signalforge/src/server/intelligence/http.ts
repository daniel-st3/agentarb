import "server-only";
import { z } from "zod";
import {
  CatalogQuerySchema,
  NetworkResponseSchema,
  ListingSchema,
  NetworkStatusSchema,
} from "@/domain/intelligence";
import {
  searchCatalog,
  getListing,
  networkSnapshot,
  evaluateOpportunity,
} from "./service";
import { readBounded } from "../http";
import { checkPlanningLimit, quotaHeaders } from "../planning-limit";
import { requestQuery } from "../request-query";
import { ArbitrageInputSchema } from "@/domain/arbitrage";
import {
  underwriteOpportunity,
  searchOpportunities,
  OpportunityQuerySchema,
} from "../arbitrage/service";
import { signalForgeEnvironment } from "../environment";
export const ListingIdSchema = z
  .string()
  .min(3)
  .max(240)
  .regex(/^[a-z0-9-]+:[a-zA-Z0-9_.:%/-]+$/);
export const EvaluationInputSchema = z
  .object({
    opportunityId: ListingIdSchema,
    agentProfile: z
      .literal("default_demo_profile")
      .default("default_demo_profile"),
  })
  .strict();
export const EvaluationSchema = z
  .object({
    opportunityId: z.string(),
    projectedMarginUsd: z.null(),
    assumptions: z.array(z.string()),
    reason: z.string(),
    executionStatus: z.literal("execution_not_enabled"),
    disclosure: z.string(),
  })
  .strict();
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export function queryInput(url: string) {
  return CatalogQuerySchema.parse(requestQuery(url, true));
}
function opportunityQuery(url: string) {
  return OpportunityQuerySchema.parse(requestQuery(url, true));
}
export async function catalogOperation(
  kind: "search" | "listing" | "status" | "evaluate" | "opportunities",
  input: unknown,
) {
  if (kind === "opportunities") return searchOpportunities(input);
  if (
    kind === "evaluate" &&
    typeof input === "object" &&
    input !== null &&
    "responseVersion" in input
  )
    return underwriteOpportunity(ArbitrageInputSchema.parse(input));
  if (kind === "search") {
    const result = await searchCatalog(CatalogQuerySchema.parse(input));
    return NetworkResponseSchema.extend({
      matchedCount: z.number(),
      truncated: z.boolean(),
    }).parse(result);
  }
  if (kind === "status") {
    const { records, ...status } = await networkSnapshot();
    const observed = records.filter((r) =>
      ["live", "cached_live"].includes(r.freshness),
    );
    return NetworkStatusSchema.parse({
      ...status,
      observedCount: observed.length,
      observedCapabilities: [
        ...new Set(
          observed.flatMap((r) =>
            r.listingType === "service_offer"
              ? r.capabilities
              : r.requiredCapabilities,
          ),
        ),
      ],
      rateLimitMode:
        status.cacheMode === "shared" ? "distributed" : "best_effort",
      environmentNamespace: signalForgeEnvironment(),
    });
  }
  const id =
    kind === "evaluate"
      ? EvaluationInputSchema.parse(input).opportunityId
      : ListingIdSchema.parse(input);
  const listing = await getListing(id);
  if (!listing) throw new Error("not_found");
  if (kind === "evaluate" && listing.listingType !== "task_opportunity")
    throw new Error("not_opportunity");
  return kind === "evaluate"
    ? EvaluationSchema.parse(evaluateOpportunity(listing))
    : ListingSchema.parse(listing);
}
export async function handleClaimReadiness(request: Request) {
  const limited = await checkPlanningLimit(request, "underwriting");
  if (limited) return limited;
  let input: z.infer<typeof ArbitrageInputSchema>;
  try {
    requestQuery(request.url);
    input = ArbitrageInputSchema.parse(await readBounded(request));
  } catch (error) {
    const status =
      error instanceof Error && error.message === "body_too_large" ? 413 : 400;
    return Response.json(
      { error: "Invalid claim-readiness request. No action occurred." },
      { status, headers },
    );
  }
  try {
    const receipt = await underwriteOpportunity(input);
    if (!receipt.claimReadiness) throw new Error("not_ready");
    return Response.json(receipt.claimReadiness, {
      headers: { ...headers, ...quotaHeaders(request) },
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "not_found" ? 404 : 503;
    return Response.json(
      { error: status === 404 ? "Opportunity not found in the current bounded catalog." : "Claim-readiness inspection is temporarily unavailable. No action occurred." },
      { status, headers },
    );
  }
}
export async function handleCatalog(
  request: Request,
  kind: "search" | "listing" | "status" | "evaluate" | "opportunities",
  id?: string,
) {
  const limited = await checkPlanningLimit(
    request,
    kind === "evaluate" ? "underwriting" : "catalog",
  );
  if (limited) return limited;
  let input: unknown;
  try {
    if (kind !== "search" && kind !== "opportunities")
      requestQuery(request.url);
    input =
      kind === "search"
        ? queryInput(request.url)
        : kind === "listing"
          ? ListingIdSchema.parse(id)
          : kind === "opportunities"
            ? opportunityQuery(request.url)
            : kind === "evaluate"
              ? z
                  .union([ArbitrageInputSchema, EvaluationInputSchema])
                  .parse(await readBounded(request))
              : {};
  } catch (error) {
    return Response.json(
      { error: "Invalid catalog request." },
      {
        status:
          error instanceof Error && error.message === "body_too_large"
            ? 413
            : 400,
        headers,
      },
    );
  }
  try {
    return Response.json(await catalogOperation(kind, input), {
      headers: { ...headers, ...quotaHeaders(request) },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.message === "not_found"
            ? "Listing not found in the current bounded catalog."
            : "Catalog data is temporarily unavailable.",
      },
      {
        status:
          error instanceof Error && error.message === "not_found"
            ? 404
            : error instanceof Error && error.message === "not_opportunity"
              ? 400
              : 503,
        headers,
      },
    );
  }
}
