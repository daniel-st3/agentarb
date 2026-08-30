"use client";
import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { commandPreview } from "@/domain/command-preview";
import { useNetworkState } from "./network-state";
export function CommandPreview({
  objective,
  contextUrl,
}: {
  objective: string;
  contextUrl: string;
}) {
  const root = useRef<HTMLElement>(null);
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
        gsap.from(".preview-node, .preview-type", {
          opacity: 0.25,
          y: 4,
          duration: 0.18,
          stagger: 0.02,
        });
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
      aria-label="Local route preview"
    >
      <p className="eyebrow">PREVIEW / LOCAL HEURISTIC</p>
      <span className="preview-coordinate">R / 01 — DETECTED</span>
      <h2 className="preview-type">{preview.type}</h2>
      <div className="preview-chain">
        <svg
          viewBox="0 0 20 100"
          preserveAspectRatio="none"
          className="preview-trace"
          aria-hidden="true"
        >
          <path d="M10 0 V100" pathLength="1" />
        </svg>
        {preview.nodes.map((n, i) => (
          <div className="preview-node" key={n.id}>
            <i aria-hidden="true" />
            <span>0{i + 1}</span>
            {n.label}
          </div>
        ))}
      </div>
      <p className="preview-fit">
        NETWORK FIT
        <br />
        <strong>
          {status?.observedCount
            ? `${fit} capability classes observed`
            : "Observation unavailable"}
        </strong>
      </p>
      <p className="field-help">
        A local hint, not a compiled route. Catalog fit does not establish
        execution eligibility.
      </p>
    </aside>
  );
}
export function ObservedSupply() {
  const { status, loading } = useNetworkState();
  const sources =
    status?.sources.filter(
      (s) =>
        ["live", "cached_live"].includes(s.freshness) &&
        s.cachedRecordCount > 0,
    ) ?? [];
  return (
    <Link href="/network" className="observed-supply">
      <span>OBSERVED SUPPLY</span>
      <strong>
        {loading
          ? "READING CATALOG SNAPSHOT"
          : sources.length
            ? sources
                .map(
                  (s) =>
                    `${s.cachedRecordCount} ${s.connectorId === "mcp" ? "MCP ENTRIES" : s.connectorId === "apisguru" ? "API SPECS" : "MODEL ENTRIES"} · ${s.freshness === "live" ? "OBSERVED" : "CACHED"}`,
                )
                .join(" / ")
            : "LIVE CATALOG UNAVAILABLE · DEMO ROUTES AVAILABLE"}
      </strong>
      <span>0 EXECUTION ACTIONS ↗</span>
      <small>DISCOVERY ONLY / NO PAYMENT · NO CLAIM · NO EXECUTION</small>
    </Link>
  );
}
