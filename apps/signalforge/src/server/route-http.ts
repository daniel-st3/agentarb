import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ObjectiveInputSchema, ObjectiveFrameSchema } from "@/domain/objective";
import {
  buildExecutionRoute,
  ExecutionRouteContractSchema,
} from "@/domain/route-planner";
import { networkSnapshot } from "./intelligence/service";
import { supplyFit } from "@/domain/intelligence";
import { frameWithProvider } from "./framing-provider";
import { readBounded } from "./http";
import { checkPlanningLimit } from "./planning-limit";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const warnings = [
  "Demo mode: no external task services were called and no payments were made. Optional Groq decomposition is not service execution or verified research.",
];
export async function planRouteService(
  input: z.infer<typeof ObjectiveInputSchema>,
  signal: AbortSignal,
  frame?: z.infer<typeof ObjectiveFrameSchema>,
) {
  const result = frame
    ? null
    : await frameWithProvider(input, () => {}, signal);
  const route = buildExecutionRoute(input, frame ?? result!.frame, {
    id: `route_${randomUUID()}`,
    createdAt: new Date().toISOString(),
  });
  const network = await networkSnapshot();
  const required = route.objectiveFrame.requiredCapabilities.map((c) => c.id);
  route.observedSupply = network.records
    .filter(
      (l) =>
        l.listingType === "service_offer" &&
        ["live", "cached_live"].includes(l.freshness) &&
        l.capabilities.some((c) => required.includes(c)),
    )
    .sort((a, b) => supplyFit(b, required) - supplyFit(a, required))
    .slice(0, 8)
    .map((l) => ({
      id: l.id,
      name: l.listingType === "service_offer" ? l.name : l.title,
      freshness: l.freshness,
      observedAt: l.observedAt,
      sourceUrl: l.sourceUrl,
      selectionStatus: "discovery_only_not_selected",
      reason:
        "Observed catalog metadata only. No executable adapter, measured quality, or defensible price is available. Excluded from executable steps; ranked for discovery fit only.",
    }));
  return {
    objectiveFrame: route.objectiveFrame,
    route: ExecutionRouteContractSchema.parse(route),
    ...(result ? { decompositionSource: result.source } : {}),
    freshnessSummary: network.sources,
    warnings: [warnings[0], ...network.warnings],
    executionStatus: "execution_not_enabled" as const,
  };
}
export async function handleRoutePlan(request: Request, compileOnly = false) {
  const limited = await checkPlanningLimit(request);
  if (limited) return limited;
  let parsed: {
    input: z.infer<typeof ObjectiveInputSchema>;
    frame?: z.infer<typeof ObjectiveFrameSchema>;
  };
  try {
    const body = await readBounded(request);
    parsed = compileOnly
      ? z
          .object({ input: ObjectiveInputSchema, frame: ObjectiveFrameSchema })
          .strict()
          .parse(body)
      : { input: ObjectiveInputSchema.parse(body), frame: undefined };
  } catch (error) {
    return Response.json(
      {
        error:
          "Unable to plan this objective. Check the objective, public context URL, and budget.",
      },
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
    return Response.json(
      await planRouteService(parsed.input, request.signal, parsed.frame),
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          "Route planning is temporarily unavailable. Please try again shortly.",
      },
      { status: 503, headers },
    );
  }
}
