"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useLocale } from "next-intl";
import { AnimatePresence, m } from "motion/react";
import { ArrowUpRight, Download } from "lucide-react";
import type { ForgeUnderwritingInput, ForgeUnderwritingResponse } from "@/domain/forge-underwriting";
import { policies } from "@/domain/schema";
import { forgeCopy, type ForgeCopy, type ForgeLocale } from "./copy";
import styles from "./forge-lab.module.css";
import { useAuth } from "@/components/account/auth-provider";
import { accountCopy } from "@/components/account/copy";
import { clearPendingForgeRun, getPendingForgeRun, setPendingForgeRun } from "@/components/account/pending-run";

type FormState = {
  objective: string;
  budget: string;
  policy: (typeof policies)[number];
  payout: string;
  fulfillment: string;
  probability: string;
  review: string;
  verification: string;
  platform: string;
  failure: string;
  refundable: string;
  margin: string;
};

const initialState = (objective: string): FormState => ({
  objective,
  budget: "10.00",
  policy: "best_value",
  payout: "",
  fulfillment: "",
  probability: "",
  review: "",
  verification: "0.00",
  platform: "0.00",
  failure: "0.00",
  refundable: "",
  margin: "25",
});

const decisionLabels: Record<string, Record<ForgeLocale, string>> = {
  conditionally_profitable: {
    en: "CONDITIONALLY PROFITABLE",
    es: "CONDICIONALMENTE RENTABLE",
    fr: "CONDITIONNELLEMENT RENTABLE",
  },
  conditionally_marginal: {
    en: "CONDITIONALLY MARGINAL",
    es: "CONDICIONALMENTE MARGINAL",
    fr: "CONDITIONNELLEMENT MARGINAL",
  },
  conditionally_uneconomic: {
    en: "CONDITIONALLY UNECONOMIC",
    es: "CONDICIONALMENTE NO RENTABLE",
    fr: "CONDITIONNELLEMENT NON RENTABLE",
  },
  insufficient_data: {
    en: "INSUFFICIENT DATA",
    es: "DATOS INSUFICIENTES",
    fr: "DONNÉES INSUFFISANTES",
  },
  unroutable: {
    en: "UNROUTABLE",
    es: "SIN RUTA POSIBLE",
    fr: "NON ROUTABLE",
  },
};

const blockerLabels: Record<string, Record<ForgeLocale, string>> = {
  payout_unknown: {
    en: "Payout was not supplied.",
    es: "No se indicó el pago.",
    fr: "La rémunération n’a pas été fournie.",
  },
  fulfillment_cost_unknown: {
    en: "Fulfillment cost was not supplied.",
    es: "No se indicó el costo de cumplimiento.",
    fr: "Le coût de réalisation n’a pas été fourni.",
  },
  observed_catalog_unavailable: {
    en: "Observed catalog context is unavailable.",
    es: "El contexto del catálogo observado no está disponible.",
    fr: "Le contexte du catalogue observé est indisponible.",
  },
  observed_capability_context_incomplete: {
    en: "Observed supply context does not cover every critical capability.",
    es: "La oferta observada no cubre todas las capacidades críticas.",
    fr: "L’offre observée ne couvre pas toutes les capacités critiques.",
  },
  hard_budget_exceeded: {
    en: "The stated cost exceeds the hard fulfillment budget.",
    es: "El costo declarado supera el presupuesto máximo.",
    fr: "Le coût déclaré dépasse le budget maximal.",
  },
  no_executable_route_candidate_set: {
    en: "No executable RouteCandidateSet exists; observed options remain context only.",
    es: "No existe un RouteCandidateSet ejecutable; las opciones observadas son solo contexto.",
    fr: "Aucun RouteCandidateSet exécutable n’existe ; les options observées restent du contexte.",
  },
};

const policyLabelKeys: Record<(typeof policies)[number], keyof ForgeCopy> = {
  best_value: "policyBestValue",
  cheapest: "policyCheapest",
  most_verified: "policyMostVerified",
  fastest: "policyFastest",
};

function isSafeForgeResponse(value: unknown): value is ForgeUnderwritingResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const receipt = candidate.receipt as Record<string, unknown> | undefined;
  const core = receipt?.core as Record<string, unknown> | undefined;
  const metadata = core?.calculationMetadata as Record<string, unknown> | undefined;
  return (
    candidate.executionStatus === "execution_not_enabled" &&
    core?.executionStatus === "execution_not_enabled" &&
    core.servicesCalled === false &&
    core.paymentsMade === false &&
    metadata?.serverAuthoritative === true &&
    typeof receipt?.receiptHash === "string" &&
    /^[a-f0-9]{64}$/.test(receipt.receiptHash)
  );
}

function money(cents: number | null, locale: ForgeLocale) {
  if (cents === null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function LedgerRow({
  label,
  value,
  provenance,
  locale,
  capital = false,
}: {
  label: string;
  value: number | null;
  provenance: string;
  locale: ForgeLocale;
  capital?: boolean;
}) {
  const magnitude = value === null ? 0 : Math.min(100, Math.max(5, Math.abs(value) / 2));
  return (
    <div className={`${styles.ledgerRow} ${capital ? styles.capitalRow : ""}`}>
      <span>{label} · {provenance}</span>
      <div
        className={styles.rail}
        data-unknown={value === null}
        style={{ "--value": `${magnitude}%` } as CSSProperties}
        aria-hidden="true"
      />
      <strong className={styles.amount}>{money(value, locale)}</strong>
    </div>
  );
}

export function ForgeLab({ initialObjective = "" }: { initialObjective?: string }) {
  const locale = useLocale() as ForgeLocale;
  const copy = forgeCopy[locale] ?? forgeCopy.en;
  const account = accountCopy[locale] ?? accountCopy.en;
  const auth = useAuth();
  const [form, setForm] = useState(() => initialState(initialObjective));
  const [result, setResult] = useState<ForgeUnderwritingResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [lastInput, setLastInput] = useState<ForgeUnderwritingInput | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const restored = useRef(false);

  const request = useMemo(
    () => ({
      objective: {
        objective: form.objective,
        budgetUsd: Number(form.budget),
        optimizationPolicy: form.policy,
        mode: "demo" as const,
      },
      locale,
      scenario: {
        ...(form.payout.trim() ? { payoutUsd: form.payout.trim() } : {}),
        ...(form.fulfillment.trim()
          ? { fulfillmentCostUsd: form.fulfillment.trim() }
          : {}),
        successProbabilityBps: form.probability.trim()
          ? Math.round(Number(form.probability) * 100)
          : Number.NaN,
        humanReviewCostUsd: form.review,
        verificationCostUsd: form.verification,
        platformCostUsd: form.platform,
        failureCostUsd: form.failure,
        ...(form.refundable.trim()
          ? { refundableCapitalUsd: form.refundable.trim() }
          : {}),
        minimumMarginBps: Math.round(Number(form.margin) * 100),
      },
    }),
    [form, locale],
  );

  useEffect(() => {
    if (restored.current) return;
    const pendingRun = getPendingForgeRun();
    if (!pendingRun) return;
    restored.current = true;
    void Promise.resolve().then(async () => {
      setResult(pendingRun.result);
      setLastInput(pendingRun.input);
      if (!auth.user) return;
      setSaveState("saving");
      try {
        const response = await fetch("/api/account/forge-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: pendingRun.input, result: pendingRun.result, saveAuthorization: pendingRun.result.saveAuthorization }),
        });
        if (!response.ok) throw new Error("save_failed");
        clearPendingForgeRun();
        setSaveState("saved");
      } catch {
        setSaveState("failed");
      }
    });
  }, [auth.user]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const probability = Number(form.probability);
    if (
      form.objective.trim().length < 12 ||
      !form.budget.trim() ||
      !Number.isFinite(Number(form.budget)) ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 100 ||
      !form.review.trim()
    ) {
      setError(copy.invalidInput);
      return;
    }
    setPending(true);
    setSaveState("idle");
    try {
      const runRequest: ForgeUnderwritingInput = { ...request, clientRunId: crypto.randomUUID() };
      const response = await fetch("/api/v1/forge/underwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runRequest),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(copy.requestError);
      if (!isSafeForgeResponse(body))
        throw new Error(copy.requestError);
      setResult(body);
      setLastInput(runRequest);
      setSaveState(body.persistence.status === "saved" ? "saved" : body.persistence.status === "failed" ? "failed" : "idle");
      requestAnimationFrame(() =>
        document.getElementById("forge-objective")?.scrollIntoView({ block: "start" }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.requestError);
    } finally {
      setPending(false);
    }
  }

  function saveGuestRun() {
    if (!result || !lastInput) return;
    setPendingForgeRun({ input: lastInput, result, returnTo: `/${locale}/forge`, createdAt: new Date().toISOString() });
    auth.openAuth();
  }

  function downloadReceipt() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.receipt, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `signalforge-forge-receipt-${result.receipt.receiptHash.slice(0, 12)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const contextText = result
    ? result.routeEvidence.status === "catalog_degraded"
      ? copy.degraded
      : result.routeEvidence.status === "coverage_incomplete"
        ? copy.incomplete
        : copy.available
    : "";
  const verdict = result
    ? (decisionLabels[result.decision]?.[locale] ?? result.decision.toUpperCase())
    : "";

  return (
    <div className={styles.lab} data-forge-lab>
      <div className={styles.shell}>
        <header className={styles.mast}>
          <div>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.intro}</p>
          </div>
          <p className={styles.boundary}>{copy.boundary}</p>
        </header>

        <div className={styles.workspace}>
          <form
            className={styles.form}
            onSubmit={submit}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }
            }}
          >
            <section>
              <span className={styles.label}>01 / {copy.task}</span>
              <label>
                {copy.objective}
                <textarea
                  aria-label="Agent objective"
                  required
                  minLength={12}
                  maxLength={2000}
                  value={form.objective}
                  onChange={(event) => field("objective", event.target.value)}
                  placeholder={copy.objectivePlaceholder}
                />
              </label>
            </section>
            <section>
              <span className={styles.label}>02 / {copy.constraints}</span>
              <div className={styles.pair}>
                <label>
                  {copy.budget}
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    required
                    value={form.budget}
                    onChange={(event) => field("budget", event.target.value)}
                  />
                </label>
                <label>
                  {copy.policy}
                  <select
                    aria-label="Routing policy"
                    value={form.policy}
                    onChange={(event) => field("policy", event.target.value as FormState["policy"])}
                  >
                    {policies.map((policy) => (
                      <option key={policy} value={policy}>{copy[policyLabelKeys[policy]]}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section>
              <span className={styles.label}>03 / {copy.economics}</span>
              <div className={styles.pair}>
                <label>
                  {copy.payout}
                  <input type="number" min="0" step="0.01" value={form.payout} onChange={(event) => field("payout", event.target.value)} />
                </label>
                <label>
                  {copy.fulfillment}
                  <input type="number" min="0" step="0.01" value={form.fulfillment} onChange={(event) => field("fulfillment", event.target.value)} />
                </label>
              </div>
              <div className={`${styles.pair} ${styles.probability}`}>
                <label>
                  {copy.probability} · {copy.userAssumption}
                  <input type="number" min="0" max="100" step="1" required value={form.probability} onChange={(event) => field("probability", event.target.value)} />
                </label>
                <output>{form.probability ? `${form.probability}%` : "—"}</output>
              </div>
              <label>
                {copy.review} · {copy.userAssumption}
                <input type="number" min="0" step="0.01" required value={form.review} onChange={(event) => field("review", event.target.value)} />
              </label>
              <details>
                <summary>{copy.advanced}</summary>
                <div className={styles.advanced}>
                  <label>{copy.verification}<input type="number" min="0" step="0.01" required value={form.verification} onChange={(event) => field("verification", event.target.value)} /></label>
                  <label>{copy.platform}<input type="number" min="0" step="0.01" required value={form.platform} onChange={(event) => field("platform", event.target.value)} /></label>
                  <label>{copy.failure}<input type="number" min="0" step="0.01" required value={form.failure} onChange={(event) => field("failure", event.target.value)} /></label>
                  <label>{copy.refundable}<input type="number" min="0" step="0.01" value={form.refundable} onChange={(event) => field("refundable", event.target.value)} /></label>
                  <label>{copy.margin}<input type="number" min="0" max="100" step="1" required value={form.margin} onChange={(event) => field("margin", event.target.value)} /></label>
                </div>
              </details>
            </section>
            <button className={styles.submit} disabled={pending} type="submit">
              {pending ? copy.working : result ? copy.recalculate : copy.submit}
              <ArrowUpRight size={18} aria-hidden="true" />
            </button>
            <p className={styles.privacy}>{copy.privacy}</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </form>

          <div className={styles.output} aria-live="polite" aria-busy={pending}>
            {!result ? (
              <div className={styles.placeholder}>
                <span aria-hidden="true">→</span>
                <p>{copy.edit}</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <m.div
                  key={result.receipt.receiptHash}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <nav className={styles.chapters} aria-label="Underwriting stages">
                    {[
                      ["forge-objective", copy.objectiveStage],
                      ["forge-capabilities", copy.capabilitiesStage],
                      ["forge-route", copy.routeStage],
                      ["forge-economics", copy.economicsStage],
                      ["forge-decision", copy.decisionStage],
                    ].map(([id, label], index) => <a key={id} href={`#${id}`}>0{index + 1} {label}</a>)}
                  </nav>

                  <section className={styles.stage} id="forge-objective">
                    <span className={styles.stageIndex}>01</span>
                    <div>
                      <span className={styles.tag}>{copy.userAssumption}</span>
                      <h2>{result.planning.objectiveFrame.title}</h2>
                      <p>{result.planning.objectiveFrame.normalizedObjective}</p>
                      <div className={styles.objectiveMeta}>
                        <div><span>{copy.budget}</span><strong>{money(Math.round(result.planning.objectiveFrame.constraints.budgetUsd * 100), locale)}</strong></div>
                        <div><span>{copy.policy}</span><strong>{copy[policyLabelKeys[result.planning.objectiveFrame.constraints.optimizationPolicy]]}</strong></div>
                        <div><span>{copy.decomposition}</span><strong>{result.planning.decompositionSource === "groq" ? copy.decompositionGroq : result.planning.decompositionSource === "local_demo_fallback" ? copy.decompositionFallback : copy.decompositionProvided}</strong></div>
                      </div>
                    </div>
                  </section>

                  <section className={styles.stage} id="forge-capabilities">
                    <span className={styles.stageIndex}>02</span>
                    <div>
                      <span className={styles.tag}>{copy.derived}</span>
                      <h2>{copy.capabilitiesStage}</h2>
                      <div className={styles.capabilities}>
                        {result.routeEvidence.capabilities.map((capability) => (
                          <div className={styles.capability} key={capability.capability}>
                            <span>{capability.priority}</span>
                            <strong>{result.planning.objectiveFrame.requiredCapabilities.find((item) => item.id === capability.capability)?.label ?? capability.capability.replaceAll("_", " ")}</strong>
                            <small className={capability.coveredByObservedContext ? styles.covered : styles.missing}>
                              {capability.coveredByObservedContext ? `${capability.observedOptionIds.length} observed` : copy.unknown}
                            </small>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className={styles.stage} id="forge-route">
                    <span className={styles.stageIndex}>03</span>
                    <div>
                      <span className={styles.tag}>{copy.observedContext}</span>
                      <h2>{result.routeEvidence.status === "context_available" ? copy.statusAvailable : result.routeEvidence.status === "coverage_incomplete" ? copy.statusIncomplete : copy.statusDegraded}</h2>
                      <p>{contextText}</p>
                      <p className={styles.routeBoundary}><strong>{copy.unknown}</strong> · {copy.observedContextHelp}</p>
                      <div className={styles.routeOptions}>
                        {result.planning.route.observedSupply.length ? result.planning.route.observedSupply.map((option) => (
                          <div className={styles.routeOption} key={option.id}>
                            <span>{option.sourceName}</span>
                            <strong>{option.name}</strong>
                            <small>{copy.observedBoundary}</small>
                          </div>
                        )) : <p className={styles.routeBoundary}>{copy.noOptions}</p>}
                      </div>
                    </div>
                  </section>

                  <section className={styles.stage} id="forge-economics">
                    <span className={styles.stageIndex}>04</span>
                    <div>
                      <span className={styles.tag}>{copy.userAssumption} → {copy.derived}</span>
                      <h2>{copy.economicsStage}</h2>
                      <div className={styles.ledger}>
                        <LedgerRow label={copy.payout} value={result.scenario.payout.valueCents} provenance={result.scenario.payout.provenance} locale={locale} />
                        <LedgerRow label={copy.fulfillment} value={result.scenario.fulfillmentCost.valueCents} provenance={result.scenario.fulfillmentCost.provenance} locale={locale} />
                        <LedgerRow label={copy.review} value={result.scenario.humanReviewCost.valueCents} provenance={copy.userAssumption} locale={locale} />
                        <LedgerRow label={copy.expectedCost} value={result.economics.expectedTotalCostCents} provenance={copy.derived} locale={locale} />
                        <LedgerRow label={copy.residual} value={result.economics.expectedProfitCents} provenance={copy.derived} locale={locale} />
                        <LedgerRow label={copy.riskAdjusted} value={result.economics.riskAdjustedExpectedValueCents} provenance={copy.derived} locale={locale} />
                        <LedgerRow label={copy.breakEven} value={result.economics.breakEvenPayoutCents} provenance={copy.derived} locale={locale} />
                        <LedgerRow label={copy.refundableCapital} value={result.financialExposure.refundableCapitalCents} provenance={result.scenario.refundableCapital.provenance} locale={locale} capital />
                        <LedgerRow label={copy.capital} value={result.financialExposure.capitalRequiredCents} provenance={copy.derived} locale={locale} capital />
                        <div className={styles.ledgerRow}><span>{copy.expectedMargin} · {copy.derived}</span><div className={styles.rail} data-unknown={result.economics.expectedMarginBps === null} /><strong className={styles.amount}>{result.economics.expectedMarginBps === null ? "—" : `${(result.economics.expectedMarginBps / 100).toFixed(2)}%`}</strong></div>
                      </div>
                    </div>
                  </section>

                  <section className={`${styles.stage} ${styles.decision}`} id="forge-decision">
                    <span className={styles.stageIndex}>05</span>
                    <div>
                      <span className={styles.tag}>{copy.derived}</span>
                      <h2 className={styles.verdict}>{verdict}</h2>
                      <p>{copy.boundary}</p>
                      {result.blockers.length > 0 && (
                        <div className={styles.blockers}>
                          <h3>{copy.blockers}</h3>
                          <ul>{result.blockers.map((blocker) => <li key={blocker}>{blockerLabels[blocker]?.[locale] ?? blocker.replaceAll("_", " ")}</li>)}</ul>
                        </div>
                      )}
                      <div className={styles.blockers}>
                        <h3>{copy.limitations}</h3>
                        <ul>{result.limitations.map((limitation) => <li key={limitation}>{blockerLabels[limitation]?.[locale] ?? limitation.replaceAll("_", " ")}</li>)}</ul>
                      </div>
                      <div className={styles.receipt}>
                        <header><span className={styles.label}>{copy.receipt}</span><button type="button" onClick={downloadReceipt}><Download size={14} aria-hidden="true" /> {copy.download}</button></header>
                        <code>{result.receipt.receiptHash}</code>
                        <small>{copy.fingerprint} · {result.receipt.hashAlgorithm}</small>
                      </div>
                      <div className={styles.savePanel}>
                        {auth.user ? (
                          <p role="status">{saveState === "saving" ? account.saving : saveState === "failed" ? account.saveFailed : account.saved}</p>
                        ) : (
                          <>
                            <button type="button" onClick={saveGuestRun}>{account.save}</button>
                            <p>{account.saveHelp}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                </m.div>
              </AnimatePresence>
            )}
            {pending && <p className={styles.status} role="status">{copy.working}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
