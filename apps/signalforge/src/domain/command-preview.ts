import { decomposeObjective, type CapabilityId } from "./objective";
const names: Record<CapabilityId, string> = {
  structured_profile: "PROFILE",
  news_search: "NEWS",
  web_research: "CONTEXT",
  claim_verification: "VERIFY",
  synthesis: "SYNTHESIZE",
  url_extract: "EXTRACT",
  document_parse: "PARSE",
  data_extract: "STRUCTURE",
  change_detection: "DIFF",
};
/** Pure local hint: no model or API call. Same classification as the route builder. */
export function commandPreview(objective: string, contextUrl = "") {
  try {
    const frame = decomposeObjective({
      objective:
        objective.trim().length >= 12
          ? objective
          : "Plan a general agent objective",
      ...(contextUrl ? { contextUrl } : {}),
      budgetUsd: 0.25,
      optimizationPolicy: "best_value",
      mode: "demo",
    });
    return {
      type: frame.objectiveType.replaceAll("_", " "),
      nodes: frame.requiredCapabilities.map((c) => ({
        id: c.id,
        label: names[c.id],
      })),
    };
  } catch {
    return {
      type: "general objective",
      nodes: [
        { id: "web_research", label: "DISCOVER" },
        { id: "synthesis", label: "SYNTHESIZE" },
      ],
    };
  }
}
