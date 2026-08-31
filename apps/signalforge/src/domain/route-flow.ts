import type { ExecutionRouteContract } from "./route-planner";

export type FlowNode = {
  id: string;
  label: string;
  kind: "objective" | "required" | "simulated" | "observed" | "rejected";
  detail: string;
};
/** Presentation-only projection. Catalog matches never become execution edges. */
export function routeFlow(
  route: ExecutionRouteContract,
  t: (text: string) => string = (text) => text,
) {
  const objective: FlowNode = {
    id: "objective",
    label: route.objectiveFrame.title,
    kind: "objective",
    detail: route.objective,
  };
  const capabilities: FlowNode[] =
    route.objectiveFrame.requiredCapabilities.map((c) => ({
      id: `cap:${c.id}`,
      label: c.label,
      kind: "required",
      detail: `${t(c.priority)} ${t("priority")}. ${t(c.purpose)} ${t("Dependencies:")} ${c.dependencies.join(", ") || t("objective")}.`,
    }));
  const selected: FlowNode[] = route.route.map((s) => ({
    id: `step:${s.step}`,
    label: s.selectedProvider.name,
    kind: "simulated",
    detail: `${s.capability}: ${t(s.rationale)} ${t("Simulated selected demo provider")}. ${t("NOT CALLED / NOT PAID / EXECUTION DISABLED")}. ${t("Fallback:")} ${s.fallbackProvider?.name ?? t("none")}.`,
  }));
  const observed: FlowNode[] = route.observedSupply.map((s) => ({
    id: `observed:${s.id}`,
    label: s.name,
    kind: "observed",
    detail: `${s.sourceName} / ${s.freshness} / ${s.observedAt}. ${t(s.reason)} ${t(s.boundaryLabel)}.`,
  }));
  const rejected: FlowNode[] = route.rejectedAlternatives
    .filter((s) => s.reason !== "capability_mismatch")
    .slice(0, 3)
    .map((s, i) => ({
      id: `rejected:${i}`,
      label: s.providerId,
      kind: "rejected",
      detail: `${s.capability} / ${s.reason}: ${t(s.explanation)}`,
    }));
  return {
    objective,
    capabilities,
    selected,
    observed,
    rejected,
    executionStatus: route.executionStatus,
  };
}
