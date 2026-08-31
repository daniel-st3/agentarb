"use client";
import { useCopy } from "@/i18n/copy";

import { useRef } from "react";
import Link from "@/i18n/navigation";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { AnimatePresence, m } from "motion/react";
import { useInteractionTiming } from "./interactions/provider";
import { commandPreview } from "@/domain/command-preview";
import { useNetworkState } from "./network-state";
export function CommandPreview({
  objective,
  contextUrl,
}: {
  objective: string;
  contextUrl: string;
}) {
  const t = useCopy();

  const root = useRef<HTMLElement>(null);
  const { reduced, transition } = useInteractionTiming();
  const preview = commandPreview(objective, contextUrl);
  const signature = preview.type + preview.nodes.map((n) => n.id).join();
  const { status } = useNetworkState();
  const fit = preview.nodes.filter((n) =>
    status?.observedCapabilities.some((c) => c === n.id),
  ).length;
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".preview-trace path", {
          strokeDashoffset: 1,
          duration: 0.28,
        });
      });
      return () => mm.revert();
    },
    { scope: root, dependencies: [signature], revertOnUpdate: true },
  );
  return (
    <aside
      className="command-preview"
      ref={root}
      aria-label={t("Local route preview")}
    >
      <p className="eyebrow">{t("PREVIEW / LOCAL HEURISTIC")}</p>
      <span className="preview-coordinate">{t("R / 01 — DETECTED")}</span>
      <div className="preview-type-slot" aria-live="polite" aria-atomic="true">
        <AnimatePresence initial={false}>
          <m.h2
            key={preview.type}
            className="preview-type"
            data-motion-owner="motion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {t(preview.type)}
          </m.h2>
        </AnimatePresence>
      </div>
      <div className="preview-chain">
        <svg
          viewBox="0 0 20 100"
          preserveAspectRatio="none"
          className="preview-trace"
          data-motion-owner="gsap"
          aria-hidden="true"
        >
          <path d="M10 0 V100" pathLength="1" />
        </svg>
        <AnimatePresence initial={false}>
          {preview.nodes.map((n, i) => (
            <m.div
              className="preview-node"
              key={n.id}
              data-motion-owner="motion"
              layout={reduced ? false : "position"}
              initial={{ opacity: 0, x: reduced ? 0 : 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={transition}
            >
              <i aria-hidden="true" />
              <span>0{i + 1}</span>
              {t(n.label)}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      <p className="preview-fit">
        {t("NETWORK FIT")}
        <br />
        <strong>
          {t(
            status?.observedCount
              ? `${fit} ${t("capability classes observed")}`
              : "Observation unavailable",
          )}
        </strong>
      </p>
      <p className="field-help">
        {t(
          "A local hint, not a compiled route. Catalog fit does not establish execution eligibility.",
        )}
      </p>
    </aside>
  );
}
export function ObservedSupply() {
  const t = useCopy();

  const { status, loading } = useNetworkState();
  const sources =
    status?.sources.filter(
      (s) =>
        ["live", "cached_live"].includes(s.freshness) &&
        s.cachedRecordCount > 0,
    ) ?? [];
  return (
    <Link href="/network" className="observed-supply">
      <span>{t("OBSERVED SUPPLY")}</span>
      <strong>
        {t(
          loading
            ? "READING CATALOG SNAPSHOT"
            : sources.length
              ? sources
                  .map(
                    (s) =>
                      `${s.cachedRecordCount} ${t(s.connectorId === "mcp" ? "MCP ENTRIES" : s.connectorId === "apisguru" ? "API SPECS" : "MODEL ENTRIES")} · ${t(s.freshness === "live" ? "OBSERVED" : "CACHED")}`,
                  )
                  .join(" / ")
              : "LIVE CATALOG UNAVAILABLE · DEMO ROUTES AVAILABLE",
        )}
      </strong>
      <span>{t("0 EXECUTION ACTIONS ↗")}</span>
      <small>
        {t("DISCOVERY ONLY / NO PAYMENT · NO CLAIM · NO EXECUTION")}
      </small>
    </Link>
  );
}
