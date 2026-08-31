import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ObjectiveInputSchema, ObjectiveFrameSchema } from "@/domain/objective";
import {
  buildExecutionRoute,
  ExecutionRouteContractSchema,
} from "@/domain/route-planner";
import { networkSnapshot } from "./intelligence/service";
import { observedCatalogOptions } from "@/domain/observed-catalog";
import { frameWithProvider } from "./framing-provider";
import { readBounded } from "./http";
import { checkPlanningLimit } from "./planning-limit";
import { PlanningResponseSchema } from "@/domain/planning-response";
import { demoDataEnabled } from "./demo-mode";
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
    ...(demoDataEnabled() ? {} : {offers:[]}),
    id: `route_${randomUUID()}`,
    createdAt: new Date().toISOString(),
  });
  if (!demoDataEnabled()) { route.executionMode = "planning_only"; route.provenance.isSimulated = false; route.provenance.note = "Observed catalog context only. No executable task quotes or provider authorization. Execution is disabled."; }
  const network = await networkSnapshot();
  const required = route.objectiveFrame.requiredCapabilities.map((c) => c.id);
  route.observedSupply = observedCatalogOptions(network.records, required);
  return PlanningResponseSchema.parse({
    objectiveFrame: route.objectiveFrame,
    route: ExecutionRouteContractSchema.parse(route),
    ...(result ? { decompositionSource: result.source } : {}),
    freshnessSummary: network.sources,
    warnings: [demoDataEnabled() ? warnings[0] : "Planning only. No service execution, task quotes or payments.", ...network.warnings],
    executionStatus: "execution_not_enabled" as const,
  });
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
