"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { m } from "motion/react";
import { useInteractionTiming } from "./interactions/provider";
import { InteractionError } from "./interactions/primitives";
import {
  DecompositionEventSchema,
  ObjectiveInputSchema,
  type DecompositionResult,
} from "@/domain/objective";
import { ExecutionRouteContractSchema } from "@/domain/route-planner";
import { policies } from "@/domain/schema";
import { policyLabels } from "@/domain/engine";

import { useResearchSession } from "./session";
import { SignalField } from "./editorial/atmosphere";
import { CommandPreview, ObservedSupply } from "./command-preview";
import { money } from "./ui";
gsap.registerPlugin(useGSAP, ScrollTrigger);

const objectiveExamples = [
  "Build a verified competitive-intelligence route for an AI search company under $0.25.",
  "Find the cheapest reliable service chain to turn this website into structured company data.",
  "Design a monitored route that detects competitor pricing changes under $3/month.",
  "Create a due-diligence route that requires independent verification for high-impact claims.",
  "Choose the best service sequence for extracting, validating, and summarizing a long public document.",
].map((question, i) => ({ name: String(i), question }));
const placeholders = [
  "Build a verified due-diligence route for a startup under $0.25.",
  "Find the lowest-cost reliable route to extract pricing from 100 websites.",
  "Design a daily monitoring route for competitor pricing changes below $3/month.",
  "Choose the best agent-service chain to parse, validate, and summarize a public document.",
];

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
  const { reduced, transition } = useInteractionTiming();
  const { saveRoute } = useResearchSession();
  const [question, setQuestion] = useState(initialObjective),
    [targetUrl, setTargetUrl] = useState(""),
    [budget, setBudget] = useState("0.25"),
    [custom, setCustom] = useState(false);
  const [policy, setPolicy] = useState<(typeof policies)[number]>("best_value");
  const [focused, setFocused] = useState(false),
    [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [phase, setPhase] = useState<
    "input" | "framing" | "ready" | "planning"
  >("input");
  const [frame, setFrame] = useState<DecompositionResult | null>(null),
    [progress, setProgress] = useState("Parsing objective…"),
    [error, setError] = useState("");
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (
      question ||
      focused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = setInterval(
      () => setPlaceholderIndex((i) => (i + 1) % placeholders.length),
      7000,
    );
    return () => clearInterval(timer);
  }, [question, focused]);
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
        if (phase === "input") {
          gsap.from(".command-heading", {
            y: 8,
            opacity: 0.35,
            duration: 0.45,
          });
          gsap.from(".canvas-rule", {
            scaleX: 0,
            transformOrigin: "left",
            duration: 0.6,
          });
          gsap.from(".command-marker", { x: -6, opacity: 0, duration: 0.35 });
          gsap.from(".canvas-bridge path", {
            strokeDashoffset: 1,
            duration: 0.7,
            delay: 0.1,
          });
        }
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
            <p className="eyebrow">AGENT ROUTING LAYER / DEMO CONTROL PLANE</p>
            <h1>What should your agent accomplish?</h1>
            <p>
              Describe an objective. Set the constraints. Compile the route.
            </p>
          </header>
          <div className="command-canvas">
            <svg
              className="canvas-bridge"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <path d="M0 15 H25 C60 15 40 85 75 85 H100" pathLength="1" />
              <circle cx="98" cy="85" r="2" />
            </svg>
            <div className="command-desk">
              <form
                onSubmit={submit}
                className="command-form"
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.metaKey || e.ctrlKey) &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    e.currentTarget.requestSubmit();
                  }
                }}
              >
                <div className="canvas-rule" />
                <span className="canvas-rail">01 / OBJECTIVE</span>
                <m.div
                  className="command-writing"
                  data-motion-owner="motion"
                  data-active={focused || !!question}
                  layout={reduced ? false : "position"}
                  transition={transition}
                >
                  <span className="command-marker" aria-hidden="true">
                    <m.span
                      className="input-marker"
                      data-motion-owner="motion"
                      animate={{
                        opacity: focused ? 1 : 0.45,
                        x: reduced ? 0 : focused ? 2 : 0,
                      }}
                      transition={transition}
                    >
                      ›
                    </m.span>
                  </span>
                  <label className="sr-only" htmlFor="research-question">
                    Agent objective
                  </label>
                  <m.textarea
                    layout={reduced ? false : "position"}
                    transition={transition}
                    data-motion-owner="motion"
                    id="research-question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    required
                    minLength={12}
                    maxLength={2000}
                    placeholder={placeholders[placeholderIndex]}
                    data-placeholder-overlay={!question && !focused}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    aria-describedby="command-privacy"
                  />
                  {!question && !focused && (
                    <span
                      key={placeholderIndex}
                      className="placeholder-echo"
                      aria-hidden="true"
                    >
                      {placeholders[placeholderIndex]}
                    </span>
                  )}
                  <m.span
                    className="input-focus-rule"
                    aria-hidden="true"
                    animate={{ scaleX: focused || question ? 1 : 0 }}
                    transition={transition}
                  />
                </m.div>
                <span className="canvas-rail">02 / CONSTRAINTS</span>
                <div className="command-controls">
                  <label>
                    BUDGET
                    <select
                      aria-label="Hard route budget"
                      value={custom ? "custom" : budget}
                      onChange={(e) => {
                        setCustom(e.target.value === "custom");
                        if (e.target.value !== "custom")
                          setBudget(e.target.value);
                      }}
                    >
                      {[0, 0.1, 0.25, 1].map((n) => (
                        <option value={String(n)} key={n}>
                          {money(n)}
                        </option>
                      ))}
                      <option value="custom">Custom</option>
                    </select>
                    <m.span
                      key={budget + String(custom)}
                      className="control-indicator"
                      aria-hidden="true"
                      initial={reduced ? false : { scaleX: 0.3, opacity: 0.4 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={transition}
                    />
                  </label>
                  <label>
                    POLICY
                    <select
                      aria-label="Routing policy"
                      value={policy}
                      onChange={(e) =>
                        setPolicy(e.target.value as typeof policy)
                      }
                    >
                      {policies.map((p) => (
                        <option value={p} key={p}>
                          {policyLabels[p]}
                        </option>
                      ))}
                    </select>
                    <m.span
                      key={policy}
                      className="control-indicator"
                      aria-hidden="true"
                      initial={reduced ? false : { scaleX: 0.3, opacity: 0.4 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={transition}
                    />
                  </label>
                  <span className="command-mode">
                    MODE<strong>DEMO</strong>
                  </span>
                  <button type="submit" className="button command-submit">
                    Compile route <ArrowUpRight size={19} />
                  </button>
                </div>
                {custom && (
                  <label className="custom-budget">
                    Custom budget ($0–$10)
                    <input
                      aria-label="Custom route budget"
                      type="number"
                      min="0"
                      max="10"
                      step=".01"
                      required
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </label>
                )}
                <p className="command-shortcut">
                  ⌘ / CTRL + ENTER TO COMPILE · MODELED USD
                </p>
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
                    <label htmlFor="command-budget">
                      Custom budget ($0–$10)
                    </label>
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
                {objectiveExamples.slice(0, 3).map((topic, i) => (
                  <button
                    key={topic.name}
                    type="button"
                    aria-label={topic.question}
                    title={topic.question}
                    onClick={() => setQuestion(topic.question)}
                  >
                    <span>0{i + 1}</span>
                    {
                      [
                        "Competitive intelligence",
                        "Structured extraction",
                        "Pricing monitor",
                      ][i]
                    }
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </div>
            <CommandPreview objective={question} contextUrl={targetUrl} />
          </div>
          <ObservedSupply />
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
      <InteractionError message={error} />
    </section>
  );
}
