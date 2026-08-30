"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  DecompositionEventSchema,
  ObjectiveInputSchema,
  type DecompositionResult,
} from "@/domain/objective";
import { ExecutionRouteContractSchema } from "@/domain/route-planner";
import { policies } from "@/domain/schema";
import { policyLabels } from "@/domain/engine";

import { useResearchSession } from "./session";
import { SignalField, PrecisionSelector } from "./editorial/atmosphere";
import { money } from "./ui";
gsap.registerPlugin(useGSAP, ScrollTrigger);

const objectiveExamples = [
  "Build a verified competitive-intelligence route for an AI search company under $0.25.",
  "Find the cheapest reliable service chain to turn this website into structured company data.",
  "Design a monitored route that detects competitor pricing changes under $3/month.",
  "Create a due-diligence route that requires independent verification for high-impact claims.",
  "Choose the best service sequence for extracting, validating, and summarizing a long public document.",
].map((question, i) => ({ name: String(i), question }));

export function ResearchCommand({
  landing = false,
  initialObjective = "",
}: {
  landing?: boolean;
  initialObjective?: string;
}) {
  const root = useRef<HTMLElement>(null),
    abort = useRef<AbortController | null>(null),
    title = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const { saveRoute } = useResearchSession();
  const [question, setQuestion] = useState(initialObjective),
    [targetUrl, setTargetUrl] = useState(""),
    [budget, setBudget] = useState("0.25"),
    [custom, setCustom] = useState(false);
  const [policy, setPolicy] = useState<(typeof policies)[number]>("best_value");
  const [phase, setPhase] = useState<
    "input" | "framing" | "ready" | "planning"
  >("input");
  const [frame, setFrame] = useState<DecompositionResult | null>(null),
    [progress, setProgress] = useState("Parsing objective…"),
    [error, setError] = useState("");
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (phase === "framing")
      root.current?.scrollIntoView({ block: "start", behavior: "instant" });
    if (phase === "framing" || phase === "ready")
      title.current?.focus({ preventScroll: true });
  }, [phase]);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        if (phase === "framing")
          gsap.from(".question-anchor", {
            y: 14,
            opacity: 0.6,
            duration: 0.25,
          });
        if (phase === "ready") {
          gsap.from(".frame-dimension", {
            y: 8,
            opacity: 0.2,
            stagger: 0.05,
            duration: 0.25,
          });
          gsap.from(".frame-connectors path", {
            strokeDasharray: 1,
            strokeDashoffset: 1,
            duration: 0.4,
          });
          gsap.fromTo(
            ".command-signal-dot",
            { x: 0 },
            { x: 72, duration: 0.4 },
          );
        }
      });
      ScrollTrigger.refresh();
      return () => media.revert();
    },
    { scope: root, dependencies: [phase], revertOnUpdate: true },
  );
  function input() {
    return ObjectiveInputSchema.parse({
      objective: question,
      contextUrl: targetUrl || undefined,
      budgetUsd: budget.trim() ? Number(budget) : NaN,
      optimizationPolicy: policy,
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = ObjectiveInputSchema.safeParse({
      objective: question,
      contextUrl: targetUrl || undefined,
      budgetUsd: budget.trim() ? Number(budget) : NaN,
      optimizationPolicy: policy,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your request.");
      return;
    }
    setFrame(null);
    setPhase("framing");
    setProgress("Parsing objective…");
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      if (response.status === 429) {
        setPhase("input");
        setError(
          "You’ve reached the public sandbox limit. Please try again shortly.",
        );
        return;
      }
      if (!response.ok || !response.body) throw new Error("unavailable");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = "",
        size = 0,
        final: DecompositionResult | null = null;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) throw new Error("oversized");
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop()!;
          for (const line of lines) {
            if (!line) continue;
            const event = DecompositionEventSchema.parse(JSON.parse(line));
            if (event.type === "status") setProgress(event.message);
            else final = event.result;
          }
        }
      } finally {
        await reader.cancel();
      }
      if (!final || pending.trim()) throw new Error("incomplete");
      setFrame(final);
      setPhase("ready");
    } catch {
      if (!controller.signal.aborted) {
        setError(
          "Decomposition was interrupted. Please try again; your objective is still here.",
        );
        setPhase("input");
      }
    }
  }
  async function continueToRoute() {
    if (!frame) return;
    setError("");
    setPhase("planning");
    try {
      const response = await fetch("/api/routes/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input(), frame: frame.frame }),
      });
      if (!response.ok) throw new Error("unavailable");
      const { route } = await response.json();
      const contract = ExecutionRouteContractSchema.parse(route);
      saveRoute(contract);
      router.push(`/forge/${contract.routeId}/plan`);
    } catch {
      setError(
        "We couldn't create this route. Please try again. Your objective is still here.",
      );
      setPhase("ready");
    }
  }
  function edit() {
    abort.current?.abort();
    setPhase("input");
    setError("");
  }
  return (
    <section
      className={`research-command container ${landing ? "command-landing" : "command-workspace"}`}
      ref={root}
    >
      <SignalField />
      {phase === "input" ? (
        <>
          <header className="command-heading">
            <p className="eyebrow">AGENT ROUTING / DEMO CONTROL PLANE</p>
            <h1>What should your agent accomplish?</h1>
            <p>
              Describe an objective. Set constraints. SignalForge selects the
              best route across specialized services.
            </p>
          </header>
          <form onSubmit={submit} className="command-form">
            <label className="sr-only" htmlFor="research-question">
              Agent objective
            </label>
            <textarea
              id="research-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
              minLength={12}
              maxLength={2000}
              placeholder="Describe a goal, the required output, and what your agent must not do."
              aria-describedby="command-privacy"
            />
            <div className="command-controls">
              <fieldset>
                <legend>
                  Hard route budget <span>modeled USD</span>
                </legend>
                <PrecisionSelector
                  className="budget-options"
                  value={custom ? "custom" : budget}
                >
                  {[0, 0.1, 0.25, 1].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={!custom && Number(budget) === n}
                      onClick={() => {
                        setBudget(String(n));
                        setCustom(false);
                      }}
                    >
                      {money(n)}
                    </button>
                  ))}
                </PrecisionSelector>
              </fieldset>
              <fieldset>
                <legend>Routing policy</legend>
                <PrecisionSelector className="policy-options" value={policy}>
                  {policies.map((p) => (
                    <button
                      type="button"
                      key={p}
                      aria-pressed={p === policy}
                      onClick={() => setPolicy(p)}
                    >
                      {policyLabels[p]}
                    </button>
                  ))}
                </PrecisionSelector>
              </fieldset>
              <button type="submit" className="button command-submit">
                Forge route <ArrowRight size={19} />
              </button>
            </div>
            <details className="command-options">
              <summary>Optional context & custom budget</summary>
              <div>
                <label htmlFor="command-url">
                  Target URL · context only, not fetched
                </label>
                <input
                  id="command-url"
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  maxLength={500}
                  placeholder="https://…"
                />
                <label htmlFor="command-budget">Custom budget ($0–$10)</label>
                <input
                  id="command-budget"
                  type="number"
                  min="0"
                  max="10"
                  step=".01"
                  value={budget}
                  onChange={(e) => {
                    setCustom(true);
                    setBudget(e.target.value);
                  }}
                />
              </div>
            </details>
          </form>
          <div className="command-examples">
            <span className="eyebrow">START WITH AN OBJECTIVE</span>
            {objectiveExamples.map((topic, i) => (
              <button
                key={topic.name}
                type="button"
                onClick={() => setQuestion(topic.question)}
              >
                <span>0{i + 1}</span>
                {topic.question}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
          <p className="command-provenance" id="command-privacy">
            Demo mode · no task services are called · no payments are made.{" "}
            <span>
              Objective decomposition may send your objective and optional URL
              to the configured model provider. Don’t include private
              information.
            </span>
          </p>
          <Link
            href="/forge/example-1"
            className="text-link command-example-link"
          >
            Inspect a compiled route <ArrowRight size={14} />
          </Link>
        </>
      ) : (
        <div className="framing-surface">
          <p className="eyebrow">OBJECTIVE → CAPABILITIES → ROUTE</p>
          <p className="question-anchor">{question}</p>
          <div className="command-signal" aria-hidden="true">
            <i className="command-signal-dot" />
          </div>
          <h1 ref={title} tabIndex={-1}>
            Decomposing objective
          </h1>
          <div role="status" className="framing-status">
            {frame ? frame.label : progress}
          </div>
          {!frame && (
            <p className="field-help">
              Mapping capabilities only. No task services are called, no
              evidence is verified, and the model does not select providers.
            </p>
          )}
          {frame && (
            <>
              <p className="frame-title">{frame.frame.title}</p>
              <p className="normalized-question">
                {frame.frame.normalizedObjective}
              </p>
              <div className="dimension-route">
                <svg
                  className="frame-connectors"
                  viewBox="0 0 12 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path pathLength="1" d="M6 0 V100" />
                </svg>
                {frame.frame.requiredCapabilities.map((dimension, i) => (
                  <article
                    className={`frame-dimension priority-${dimension.priority}`}
                    key={i}
                  >
                    <span>0{i + 1}</span>
                    <div>
                      <h2>{dimension.label}</h2>
                      <p>{dimension.purpose}</p>
                      <small>
                        requires:{" "}
                        {dimension.dependencies.join(" → ") ||
                          "objective input"}
                      </small>
                    </div>
                    <small>{dimension.priority} priority</small>
                  </article>
                ))}
              </div>
              <p className="frame-boundary">
                Hard cap {money(frame.frame.constraints.budgetUsd)}
                {frame.frame.constraints.requiresRecurringExecution
                  ? " / month"
                  : " / route"}{" "}
                · {policyLabels[frame.frame.constraints.optimizationPolicy]} ·{" "}
                {frame.frame.constraints.verificationStandard.replaceAll(
                  "_",
                  " ",
                )}
                {frame.frame.constraints.maxLatencySeconds
                  ? ` · ${frame.frame.constraints.maxLatencySeconds}s maximum`
                  : ""}
              </p>
              <div className="frame-conclusion">
                <div>
                  <p className="eyebrow">EXPECTED OUTPUT CONTRACT</p>
                  <p>{frame.frame.expectedOutput.description}</p>
                </div>
                <div>
                  <p className="eyebrow">ROUTE RATIONALE</p>
                  <p>{frame.frame.routeRationale}</p>
                </div>
              </div>
              {frame.frame.ambiguities.length > 0 && (
                <div className="frame-ambiguities">
                  <p className="eyebrow">CONTEXT TO CLARIFY</p>
                  <ul>
                    {frame.frame.ambiguities.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="frame-boundary">
                Objective decomposition, not execution. The deterministic
                planner retains all provider and budget decisions. Task services
                are never called in this demo.
                {frame.fallback
                  ? " The model was unavailable; local decomposition kept the route usable."
                  : ""}
              </p>
              <div className="frame-actions">
                <button
                  className="button"
                  disabled={phase === "planning"}
                  onClick={continueToRoute}
                >
                  {phase === "planning"
                    ? "Comparing demo services…"
                    : "Build execution route"}
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={phase === "planning"}
                  onClick={edit}
                >
                  Edit objective
                </button>
              </div>
            </>
          )}
          {!frame && (
            <button type="button" className="text-link" onClick={edit}>
              Edit objective
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
