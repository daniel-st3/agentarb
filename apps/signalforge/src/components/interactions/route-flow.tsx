"use client";
import { useCopy } from "@/i18n/copy";

import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { routeFlow, type FlowNode } from "@/domain/route-flow";
import type { ExecutionRouteContract } from "@/domain/route-planner";
import { useInteractionTiming } from "./provider";
import { ResultTransition, TechnicalLabel } from "./primitives";

const kindLabels = {
  objective: "OBJECTIVE",
  required: "REQUIRED CAPABILITY",
  simulated: "SIMULATED SELECTED PROVIDER",
  observed: "OBSERVED CATALOG OPTION",
  rejected: "REJECTED / NOT SELECTED",
};
export function RouteFlow({ route }: { route: ExecutionRouteContract }) {
  const t = useCopy();

  const graph = routeFlow(route, t);
  const [selected, setSelected] = useState<FlowNode>(graph.objective);
  const { reduced, transition } = useInteractionTiming();
  function node(item: FlowNode) {
    return (
      <m.button
        type="button"
        key={item.id}
        className={`flow-node flow-${item.kind}`}
        data-motion-owner="motion"
        data-kind={item.kind}
        aria-pressed={selected.id === item.id}
        aria-controls="flow-inspection"
        onFocus={() => setSelected(item)}
        onClick={() => setSelected(item)}
        initial={false}
        animate={{ x: reduced ? 0 : selected.id === item.id ? 3 : 0 }}
        transition={transition}
      >
        <span className="flow-dot" aria-hidden="true" />
        <small>{t(kindLabels[item.kind])}</small>
        <span>{t(item.label)}</span>
      </m.button>
    );
  }
  return (
    <section
      className="route-flow"
      aria-label={t("Route composition inspector")}
      data-motion-owner="motion"
    >
      <div className="flow-heading">
        <div>
          <p className="eyebrow">{t("CONTRACT / COMPOSITION")}</p>
          <h2>{t("From objective to route.")}</h2>
        </div>
        <TechnicalLabel term="execution_not_enabled" />
      </div>
      <p className="field-help">
        {t(
          "Select or focus a node to inspect its rationale. Dashed catalog context is not a service call or an execution path.",
        )}
      </p>
      <div className="flow-columns">
        <svg
          viewBox="0 0 1000 40"
          preserveAspectRatio="none"
          className="flow-lines"
          aria-hidden="true"
        >
          <path d="M20 20 H260 M270 20 H745 M755 20 H990" />
          <path className="flow-context-path" d="M520 20 V40" />
          <circle cx="20" cy="20" r="3" />
          <circle cx="990" cy="20" r="3" />
        </svg>
        <div className="flow-column">
          <h3>{t("01 / Objective")}</h3>
          {node(graph.objective)}
        </div>
        <div className="flow-column">
          <h3>{t("02 / Capabilities")}</h3>
          {graph.capabilities.map(node)}
        </div>
        <div className="flow-column flow-catalog">
          <h3>{t("03 / Observed options")}</h3>
          {t(
            graph.observed.length ? (
              graph.observed.map(node)
            ) : (
              <p className="field-help">
                {t(
                  "No observed options attached. This contract contains no live catalog evidence.",
                )}
              </p>
            ),
          )}
          {graph.rejected.length > 0 && (
            <details>
              <summary>{t("Sample rejected alternatives")}</summary>
              {graph.rejected.map(node)}
              <p className="field-help">
                {t("Full reasons remain in the alternatives ledger.")}
              </p>
            </details>
          )}
        </div>
        <div className="flow-column">
          <h3>{t("04 / Compiled route")}</h3>
          {t(
            graph.selected.length ? (
              graph.selected.map(node)
            ) : (
              <p className="field-help">
                {t("No feasible selected steps. Inspect unmet requirements.")}
              </p>
            ),
          )}
          <p className="flow-stop">{t("STOP / EXECUTION DISABLED")}</p>
        </div>
      </div>
      <div
        id="flow-inspection"
        className="flow-inspection"
        role="region"
        aria-label={t("Selected node provenance")}
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence initial={false} mode="wait">
          <ResultTransition key={selected.id}>
            <p className="eyebrow">{t(kindLabels[selected.kind])}</p>
            <h3>{t(selected.label)}</h3>
            <p>{t(selected.detail)}</p>
            <p className="flow-boundary">
              {t("BOUNDARY / NOT CALLED / NOT PAID / EXECUTION DISABLED")}
            </p>
          </ResultTransition>
        </AnimatePresence>
      </div>
    </section>
  );
}
