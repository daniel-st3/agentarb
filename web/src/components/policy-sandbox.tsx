"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { AnimatePresence } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  ShieldCheck,
} from "lucide-react";
import {
  CATEGORIES,
  CORE_CAPABILITIES,
  MARKETPLACES,
  OPTIONAL_RESTRICTIONS,
  REQUIRED_PROHIBITIONS,
  TEMPLATE_DEFAULTS,
  TOOLS,
  type EvaluationResponse,
  type EvaluationRow,
  type PolicyEnvelope,
} from "@/lib/contracts";
import { pretty, money } from "@/lib/display";
import { PackagePreview } from "./package-preview";
gsap.registerPlugin(useGSAP);

export function PolicySandbox() {
  const sandbox = useRef<HTMLElement>(null);
  const [sessionId, setSessionId] = useState("");
  const [template, setTemplate] =
    useState<keyof typeof TEMPLATE_DEFAULTS>("Research Analyst");
  const [config, setConfig] = useState<Omit<PolicyEnvelope, "sessionId">>(
    TEMPLATE_DEFAULTS["Research Analyst"],
  );
  const [evaluatedConfig, setEvaluatedConfig] = useState(config);
  const [response, setResponse] = useState<EvaluationResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "allow" | "skip" | "refuse">(
    "all",
  );
  const [selected, setSelected] = useState<EvaluationRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [mobilePane, setMobilePane] = useState("configure");
  const previousPane = useRef(mobilePane);

  useEffect(() => {
    if (previousPane.current === mobilePane) return;
    previousPane.current = mobilePane;
    if (window.matchMedia("(max-width: 820px)").matches) {
      sandbox.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [mobilePane]);

  useEffect(() => setSessionId(crypto.randomUUID()), []);
  useEffect(() => {
    if (!response?.results.some((row) => row.sourceType === "live_public"))
      return;
    const timer = window.setTimeout(
      () =>
        setResponse((current) =>
          current
            ? {
                ...current,
                results: current.results.map((row) =>
                  row.sourceType === "live_public"
                    ? { ...row, sourceType: "cached_public" }
                    : row,
                ),
                statuses: current.statuses.map((source) =>
                  source.status === "available"
                    ? { ...source, status: "cached" }
                    : source,
                ),
              }
            : null,
        ),
      30_000,
    );
    return () => window.clearTimeout(timer);
  }, [response]);
  useEffect(() => {
    if (cooldown < 1) return;
    const timer = window.setInterval(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useGSAP(
    () => {
      if (
        !response ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      gsap.from("[data-result-card]", {
        opacity: 0,
        y: 18,
        stagger: 0.06,
        duration: 0.5,
        ease: "power3.out",
      });
    },
    { scope: sandbox, dependencies: [response, filter], revertOnUpdate: true },
  );

  const applyTemplate = (name: keyof typeof TEMPLATE_DEFAULTS) => {
    setTemplate(name);
    setConfig(structuredClone(TEMPLATE_DEFAULTS[name]));
    setResponse(null);
    setSelected(null);
    setError("");
  };

  const toggle = (
    field:
      | "supportedCategories"
      | "allowedTools"
      | "prohibitedActions"
      | "capabilities",
    value: string,
  ) => {
    setConfig((current) => {
      const values = current.profile[field] as string[];
      const required =
        field === "prohibitedActions" &&
        (REQUIRED_PROHIBITIONS as readonly string[]).includes(value);
      if (required) return current;
      return {
        ...current,
        profile: {
          ...current.profile,
          [field]: values.includes(value)
            ? values.filter((item) => item !== value)
            : [...values, value],
        },
      };
    });
  };

  const toggleMarketplace = (value: string) => {
    setConfig((current) => {
      const values = current.policy.allowedMarketplaces;
      return {
        ...current,
        policy: {
          ...current.policy,
          allowedMarketplaces: values.includes(value as never)
            ? values.filter((item) => item !== value)
            : [...values, value as never],
        },
      };
    });
  };

  const evaluate = async () => {
    if (!sessionId || cooldown > 0) return;
    setLoading(true);
    setMobilePane("decisions");
    setCooldown(30);
    setError("");
    setSelected(null);
    try {
      const request = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, sessionId }),
      });
      if (request.status === 429 || request.status === 503) {
        const retry = Number(request.headers.get("Retry-After"));
        if (Number.isInteger(retry) && retry > 0 && retry <= 600)
          setCooldown(retry);
        throw new Error(
          request.status === 429
            ? "You’ve reached the public sandbox limit. Please try again shortly."
            : "The public sandbox is temporarily unavailable. Please try again shortly.",
        );
      }
      const payload = await request.json();
      if (!request.ok)
        throw new Error(
          payload.issues?.join(" ") ??
            payload.error ??
            "Evaluation could not be completed.",
        );
      setResponse(payload as EvaluationResponse);
      setEvaluatedConfig(structuredClone(config));
      setFilter("all");
      setCooldown(30);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Evaluation could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () =>
      response?.results.filter(
        (row) => filter === "all" || row.packageEligibility === filter,
      ) ?? [],
    [response, filter],
  );
  const counts = useMemo(
    () => ({
      allow:
        response?.results.filter((row) => row.packageEligibility === "allow")
          .length ?? 0,
      skip:
        response?.results.filter((row) => row.packageEligibility === "skip")
          .length ?? 0,
      refuse:
        response?.results.filter((row) => row.packageEligibility === "refuse")
          .length ?? 0,
    }),
    [response],
  );

  return (
    <section id="sandbox" className="sandbox section-wrap" ref={sandbox}>
      <div className="sandbox-title" data-reveal>
        <div>
          <p className="eyebrow">Interactive policy sandbox</p>
          <h2>See the policy before the permission.</h2>
        </div>
        <div className="sandbox-boundary">
          <ShieldCheck />
          <span>
            SESSION-ONLY SANDBOX
            <br />
            <strong>NO MARKETPLACE ACTIONS</strong>
          </span>
        </div>
      </div>
      <div className="operator-console">
        <div
          className="mobile-console-nav"
          role="group"
          aria-label="Sandbox panels"
        >
          {["configure", "decisions", "evidence"].map((pane) => (
            <button
              key={pane}
              type="button"
              aria-pressed={mobilePane === pane}
              onClick={() => setMobilePane(pane)}
            >
              {pretty(pane)}
            </button>
          ))}
        </div>
        <aside
          className="console-config"
          data-mobile-active={mobilePane === "configure"}
          aria-label="Worker profile and policy"
        >
          <div className="console-kicker">
            <span>01</span>
            <div>
              <strong>Configure</strong>
              <small>Temporary session policy</small>
            </div>
          </div>
          <fieldset>
            <legend>Worker template</legend>
            <div className="template-grid">
              {(
                Object.keys(TEMPLATE_DEFAULTS) as Array<
                  keyof typeof TEMPLATE_DEFAULTS
                >
              ).map((name) => (
                <button
                  key={name}
                  type="button"
                  className={template === name ? "template active" : "template"}
                  onClick={() => applyTemplate(name)}
                  aria-pressed={template === name}
                >
                  <span>{name}</span>
                  {template === name ? <Check /> : null}
                </button>
              ))}
            </div>
          </fieldset>
          <OptionGroup
            title="Supported categories"
            help="Only these task types may pass capability matching."
            options={CATEGORIES}
            selected={config.profile.supportedCategories}
            onToggle={(value) => toggle("supportedCategories", value)}
          />
          <OptionGroup
            title="Allowed local tools"
            help="Descriptive planning tools only; no browser, shell, or execution."
            options={TOOLS}
            selected={config.profile.allowedTools}
            onToggle={(value) => toggle("allowedTools", value)}
          />
          <details className="config-detail">
            <summary>
              Capabilities & permanent restrictions <ChevronRight />
            </summary>
            <OptionGroup
              title="Available capabilities"
              help="Removing a required capability produces a skip."
              options={[...CORE_CAPABILITIES, ...CATEGORIES]}
              selected={config.profile.capabilities}
              onToggle={(value) => toggle("capabilities", value)}
            />
            <p className="fixed-prohibitions">
              Always prohibited: {REQUIRED_PROHIBITIONS.map(pretty).join(", ")}.
            </p>
          </details>
          <OptionGroup
            title="Additional restrictions"
            help="The nine core prohibitions are permanent and cannot be removed."
            options={OPTIONAL_RESTRICTIONS}
            selected={config.profile.prohibitedActions}
            onToggle={(value) => toggle("prohibitedActions", value)}
          />
          <div className="limits-grid">
            <NumberField
              label="Max projected cost"
              prefix="$"
              value={config.profile.maxExecutionCostUsd}
              step={0.05}
              min={0}
              max={100}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  profile: { ...current.profile, maxExecutionCostUsd: value },
                }))
              }
            />
            <NumberField
              label="Max duration"
              suffix="min"
              value={config.profile.maxExecutionMinutes}
              step={5}
              min={1}
              max={240}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  profile: { ...current.profile, maxExecutionMinutes: value },
                }))
              }
            />
            <NumberField
              label="Minimum payout"
              prefix="$"
              value={config.policy.minPayoutUsd}
              step={1}
              min={0}
              max={10000}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  policy: { ...current.policy, minPayoutUsd: value },
                }))
              }
            />
            <NumberField
              label="Minimum margin"
              prefix="$"
              value={config.policy.minExpectedMarginUsd}
              step={1}
              min={-100}
              max={10000}
              onChange={(value) =>
                setConfig((current) => ({
                  ...current,
                  policy: { ...current.policy, minExpectedMarginUsd: value },
                }))
              }
            />
          </div>
          <label className="range-field">
            <span>
              <strong>Minimum confidence</strong>
              <output>{Math.round(config.policy.minConfidence * 100)}%</output>
            </span>
            <input
              aria-label="Minimum confidence"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.policy.minConfidence}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  policy: {
                    ...current.policy,
                    minConfidence: Number(event.target.value),
                  },
                }))
              }
            />
          </label>
          <OptionGroup
            title="Allowed marketplaces"
            help="Controlled demonstration records are always labelled as such."
            options={MARKETPLACES}
            selected={config.policy.allowedMarketplaces}
            onToggle={toggleMarketplace}
          />
          <div className="locked-rule">
            <Check />
            <div>
              <strong>Human approval always required</strong>
              <small>Locked in this public sandbox</small>
            </div>
          </div>
          <button
            className="button evaluate-button"
            type="button"
            onClick={evaluate}
            disabled={loading || !sessionId || cooldown > 0}
          >
            {loading
              ? "Evaluating policy…"
              : cooldown
                ? `Refresh available in ${cooldown}s`
                : "Evaluate public opportunities"}
            {!loading ? <ArrowDownRight /> : null}
          </button>
        </aside>

        <div
          className="console-results"
          data-mobile-active={mobilePane === "decisions"}
          aria-live="polite"
        >
          <div className="console-kicker">
            <span>02</span>
            <div>
              <strong>Decisions</strong>
              <small>Deterministic policy engine</small>
            </div>
          </div>
          {loading ? <PipelineLoading /> : null}
          {error ? (
            <div className="error-state">
              <CircleAlert />
              <div>
                <strong>Evaluation unavailable</strong>
                <p>{error}</p>
                <small>
                  Controlled demonstration data has not been presented as live.
                </small>
              </div>
            </div>
          ) : null}
          {!loading && !response && !error ? <SandboxEmpty /> : null}
          {response ? (
            <>
              <p className="snapshot-note">
                Results use the evaluated {evaluatedConfig.profile.template}{" "}
                snapshot. Changed settings apply on the next evaluation.
              </p>
              <SourceLedger response={response} />
              <div
                className="result-tabs"
                role="tablist"
                aria-label="Filter decisions"
              >
                {[
                  ["all", "All", response.results.length],
                  ["allow", "Allowed", counts.allow],
                  ["skip", "Skipped", counts.skip],
                  ["refuse", "Refused", counts.refuse],
                ].map(([value, name, count]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    tabIndex={filter === value ? 0 : -1}
                    aria-controls="decision-results"
                    onKeyDown={(event) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      )
                        return;
                      event.preventDefault();
                      const tabs = Array.from(
                        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                          "[role=tab]",
                        ) ?? [],
                      );
                      const index = tabs.indexOf(event.currentTarget);
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : (index +
                                (event.key === "ArrowRight" ? 1 : -1) +
                                tabs.length) %
                              tabs.length;
                      tabs[next]?.click();
                      tabs[next]?.focus();
                    }}
                    onClick={() => setFilter(value as typeof filter)}
                  >
                    {name}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
              <div
                className="results-list"
                id="decision-results"
                role="tabpanel"
                aria-label="Policy decisions"
              >
                {!filtered.length ? (
                  <p className="snapshot-note">
                    No opportunities match this decision filter.
                  </p>
                ) : null}
                {["public", "controlled"].map((group) => {
                  const rows = filtered.filter(
                    (row) =>
                      (row.sourceType === "controlled_demonstration") ===
                      (group === "controlled"),
                  );
                  return rows.length ? (
                    <section
                      key={group}
                      aria-label={
                        group === "public"
                          ? "Public discovery results"
                          : "Controlled demonstration results"
                      }
                    >
                      <h4 className="result-source-heading">
                        {group === "public"
                          ? "Public discovery · read-only"
                          : "Controlled demonstration · simulation only"}
                      </h4>
                      {rows.map((row) => (
                        <OpportunityCard
                          key={row.opportunityId}
                          row={row}
                          onPreview={setSelected}
                        />
                      ))}
                    </section>
                  ) : null;
                })}
              </div>
            </>
          ) : null}
        </div>
        <aside
          className="console-evidence"
          data-mobile-active={mobilePane === "evidence"}
          aria-label="Evidence boundaries"
        >
          <div className="console-kicker">
            <span>03</span>
            <div>
              <strong>Evidence</strong>
              <small>What each label means</small>
            </div>
          </div>
          <EvidenceKey
            tone="live"
            title="Live public data"
            text="Fetched now from a fixed public GET route."
          />
          <EvidenceKey
            tone="cache"
            title="Cached public data"
            text="Previously observed public data, shown with its timestamp."
          />
          <EvidenceKey
            tone="mock"
            title="Controlled demonstration"
            text="Purpose-built local fixtures; never presented as live."
          />
          <EvidenceKey
            tone="offline"
            title="Offline / unavailable"
            text="The source returned no usable public data."
          />
          <div className="evidence-rule" />
          <dl className="constant-list">
            <div>
              <dt>External execution</dt>
              <dd>discovery_only</dd>
            </div>
            <div>
              <dt>LLM provider</dt>
              <dd>none</dd>
            </div>
            <div>
              <dt>Visitor persistence</dt>
              <dd>none</dd>
            </div>
            <div>
              <dt>Real outcomes</dt>
              <dd>0</dd>
            </div>
          </dl>
          <p className="evidence-note">
            Simulation-only evidence remains separate from live discovery and
            real outcomes.
          </p>
        </aside>
      </div>
      <AnimatePresence>
        {selected ? (
          <PackagePreview
            row={selected}
            config={{ ...evaluatedConfig, sessionId }}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function OptionGroup({
  title,
  help,
  options,
  selected,
  onToggle,
}: {
  title: string;
  help: string;
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="option-group">
      <legend>{title}</legend>
      <p>{help}</p>
      <div className="check-list">
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
            />
            <span aria-hidden="true">
              <Check />
            </span>
            {pretty(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        {prefix ? <small>{prefix}</small> : null}
        <input
          type="number"
          aria-label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function PipelineLoading() {
  return (
    <div className="pipeline-loading" data-testid="loading-state">
      <div className="loading-rule">
        <span />
      </div>
      <p>Evaluating the public opportunity pipeline</p>
      {[
        "Fetching public listings",
        "Normalizing task data",
        "Checking policy constraints",
        "Computing deterministic estimates",
      ].map((stage, index) => (
        <div key={stage}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{stage}</strong>
          <small>{index === 0 ? "In progress" : "Queued on server"}</small>
        </div>
      ))}
    </div>
  );
}

function SandboxEmpty() {
  return (
    <div className="sandbox-empty">
      <div className="empty-orbit">
        <span>POLICY</span>
        <i />
        <i />
        <i />
      </div>
      <p className="eyebrow">Ready to evaluate</p>
      <h3>Configure a worker. Inspect the boundary.</h3>
      <p>
        Public listings are requested only when you evaluate. Controlled records
        remain visibly separate.
      </p>
      <div className="empty-facts">
        <span>Session memory only</span>
        <span>Deterministic estimates</span>
        <span>Zero action authority</span>
      </div>
    </div>
  );
}

function SourceLedger({ response }: { response: EvaluationResponse }) {
  return (
    <div className="source-ledger">
      {response.statuses.map((status) => (
        <div key={status.marketplace}>
          <span
            className={
              status.status === "available"
                ? "source-dot available"
                : "source-dot"
            }
          />
          <div>
            <strong>{pretty(status.marketplace)}</strong>
            <small>
              {status.status === "available"
                ? `${status.count} live public ${status.count === 1 ? "listing" : "listings"}`
                : status.status === "cached"
                  ? `${status.count} cached public listings · refresh to update`
                  : status.status === "empty"
                    ? "No public listings at last check"
                    : "Public source unavailable"}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

function sourceLabel(source: EvaluationRow["sourceType"]) {
  if (source === "live_public") return "LIVE PUBLIC DATA";
  if (source === "cached_public") return "CACHED PUBLIC DATA";
  if (source === "controlled_demonstration") return "CONTROLLED DEMONSTRATION";
  return "OFFLINE / UNAVAILABLE";
}

function OpportunityCard({
  row,
  onPreview,
}: {
  row: EvaluationRow;
  onPreview: (row: EvaluationRow) => void;
}) {
  return (
    <article
      className={`opportunity-card ${row.packageEligibility}`}
      data-result-card
    >
      <div className="opportunity-top">
        <span className={`source-badge ${row.sourceType}`}>
          {sourceLabel(row.sourceType)}
        </span>
        <span className={`decision-badge ${row.packageEligibility}`}>
          {row.packageEligibility === "allow"
            ? "Allowed for preview"
            : row.packageEligibility === "skip"
              ? "Skipped"
              : "Refused"}
        </span>
      </div>
      <h3>{row.title}</h3>
      <p className="opportunity-meta">
        {pretty(row.marketplace)} · {pretty(row.category)} ·{" "}
        <code>discovery_only</code>
      </p>
      <div className="metrics-row">
        <Metric label="Payout" value={money(row.payoutUsd)} />
        <Metric
          label="Projected task cost"
          value={
            row.estimateAvailable
              ? money(row.estimated_task_execution_cost_usd, 4)
              : "—"
          }
        />
        <Metric
          label="Projected margin"
          value={row.estimateAvailable ? money(row.expected_margin_usd) : "—"}
        />
        <Metric
          label="Confidence"
          value={
            row.estimateAvailable ? `${Math.round(row.confidence * 100)}%` : "—"
          }
        />
      </div>
      <details>
        <summary>
          Decision evidence <ChevronRight />
        </summary>
        <dl className="decision-details">
          <div>
            <dt>Reason code</dt>
            <dd>
              <code>{row.reasonCodes.join(", ")}</code>
            </dd>
          </div>
          <div>
            <dt>Rationale</dt>
            <dd>{row.rationale}</dd>
          </div>
          <div>
            <dt>Projected duration</dt>
            <dd>
              {row.estimateAvailable
                ? row.estimatedDurationMinutes.toFixed(1) + " minutes"
                : "Not estimated; a prior gate stopped evaluation."}
            </dd>
          </div>
          <div>
            <dt>Capability match</dt>
            <dd>
              {row.capabilityMatch === null
                ? "Not evaluated"
                : row.capabilityMatch
                  ? "Yes"
                  : "No"}
            </dd>
          </div>
          <div>
            <dt>Observed at</dt>
            <dd>
              {row.observedAt ?? "Controlled fixture; no live observation"}
            </dd>
          </div>
          <div>
            <dt>Required reputation</dt>
            <dd>{row.requiredReputation}</dd>
          </div>
          <div>
            <dt>Claim / settlement</dt>
            <dd>
              {pretty(row.claimConstraint)} / {pretty(row.settlementConstraint)}
            </dd>
          </div>
          <div>
            <dt>Actual LLM inference cost</dt>
            <dd>$0.00 · no LLM call</dd>
          </div>
        </dl>
      </details>
      {row.packageEligibility === "allow" ? (
        <button
          type="button"
          className="preview-link"
          onClick={() => onPreview(row)}
        >
          Open governed preview <ArrowUpRight />
        </button>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EvidenceKey({
  tone,
  title,
  text,
}: {
  tone: string;
  title: string;
  text: string;
}) {
  return (
    <div className="evidence-key">
      <span className={`evidence-swatch ${tone}`} />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
