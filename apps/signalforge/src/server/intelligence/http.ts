import "server-only";
import { z } from "zod";
import {
  CatalogQuerySchema,
  NetworkResponseSchema,
  ListingSchema,
} from "@/domain/intelligence";
import {
  searchCatalog,
  getListing,
  networkSnapshot,
  evaluateOpportunity,
} from "./service";
import { readBounded } from "../http";
import { checkPlanningLimit } from "../planning-limit";
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
  const params = new URL(url).searchParams;
  for (const key of params.keys())
    if (params.getAll(key).length > 1) throw new Error("invalid");
  return CatalogQuerySchema.parse(Object.fromEntries(params));
}
export async function catalogOperation(
  kind: "search" | "listing" | "status" | "evaluate",
  input: unknown,
) {
  if (kind === "search") {
    const result = await searchCatalog(CatalogQuerySchema.parse(input));
    return NetworkResponseSchema.extend({
      matchedCount: z.number(),
      truncated: z.boolean(),
    }).parse(result);
  }
  if (kind === "status") {
    const { records: _, ...status } = await networkSnapshot();
    void _;
    return status;
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
export async function handleCatalog(
  request: Request,
  kind: "search" | "listing" | "status" | "evaluate",
  id?: string,
) {
  const limited = await checkPlanningLimit(request, "catalog");
  if (limited) return limited;
  let input: unknown;
  try {
    input =
      kind === "search"
        ? queryInput(request.url)
        : kind === "listing"
          ? ListingIdSchema.parse(id)
          : kind === "evaluate"
            ? EvaluationInputSchema.parse(await readBounded(request))
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
    return Response.json(await catalogOperation(kind, input), { headers });
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
