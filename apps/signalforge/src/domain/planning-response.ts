import { z } from "zod";
import { ObjectiveFrameSchema } from "./objective";
import { ExecutionRouteContractSchema } from "./route-planner";
import { ConnectorHealthSchema } from "./intelligence";
export const PlanningResponseSchema = z
  .object({
    objectiveFrame: ObjectiveFrameSchema,
    route: ExecutionRouteContractSchema,
    decompositionSource: z.enum(["groq", "local_demo_fallback"]).optional(),
    freshnessSummary: z.array(ConnectorHealthSchema),
    warnings: z.array(z.string()),
    executionStatus: z.literal("execution_not_enabled"),
  })
  .strict();
