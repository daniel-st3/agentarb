import { z } from "zod";

export const forgeProgressStages = [
  "understanding_objective",
  "mapping_capabilities",
  "checking_observed_supply",
  "building_route_evidence",
  "underwriting_economics",
  "making_decision",
  "compiling_receipt",
] as const;

export const ForgeProgressStageSchema = z.enum(forgeProgressStages);
export type ForgeProgressStage = z.infer<typeof ForgeProgressStageSchema>;
