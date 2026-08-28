"use client";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, CircleStop, ShieldCheck, X } from "lucide-react";
import { type EvaluationRow, type PolicyEnvelope } from "@/lib/contracts";
import { createPackagePreview } from "@/lib/policy";
import { pretty, money } from "@/lib/display";

export function PackagePreview({
  row,
  config,
  onClose,
}: {
  row: EvaluationRow;
  config: PolicyEnvelope;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reducedMotion = useReducedMotion();
  const preview = createPackagePreview(row, config);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);
  return (
    <motion.dialog
      ref={dialog}
      className="package-preview"
      aria-labelledby="preview-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            "button, a[href], input, select, textarea, [tabindex='0']",
          ) ?? [],
        );
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : 18 }}
      transition={{
        duration: reducedMotion ? 0 : 0.25,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Governed work package</p>
          <h2 id="preview-title">Read-only package preview</h2>
        </div>
        <button
          type="button"
          ref={closeButton}
          onClick={onClose}
          aria-label="Close package preview"
        >
          <X />
        </button>
      </header>
      <div className="preview-boundaries">
        <code>package_preview_only = true</code>
        <code>submission_status = not_submitted</code>
        <code>marketplace_action_authorized = false</code>
        <code>external_execution_status = discovery_only</code>
      </div>
      <div className="preview-intro">
        <div className="flex flex-wrap gap-2">
          <span className="decision-badge allow">Allowed for preview</span>
          <span className={`source-badge ${row.sourceType}`}>
            {row.sourceType === "controlled_demonstration"
              ? "CONTROLLED DEMONSTRATION"
              : row.sourceType === "cached_public"
                ? "CACHED PUBLIC DATA"
                : "LIVE PUBLIC DATA"}
          </span>
        </div>
        <h3>{row.title}</h3>
        <p>{row.description}</p>
        <p>{preview.reasonForAllowance}</p>
        <p className="snapshot-note">
          {pretty(row.marketplace)} · {row.opportunityId} · schema:
          sandbox-preview/1
        </p>
      </div>
      <div className="preview-grid">
        <section>
          <p className="eyebrow">Worker profile snapshot</p>
          <dl>
            <div>
              <dt>Template</dt>
              <dd>{config.profile.template}</dd>
            </div>
            <div>
              <dt>Categories</dt>
              <dd>
                {config.profile.supportedCategories.map(pretty).join(", ")}
              </dd>
            </div>
            <div>
              <dt>Local tools</dt>
              <dd>{config.profile.allowedTools.map(pretty).join(", ")}</dd>
            </div>
            <div>
              <dt>Capabilities</dt>
              <dd>{config.profile.capabilities.map(pretty).join(", ")}</dd>
            </div>
            <div>
              <dt>Max projected cost</dt>
              <dd>{money(config.profile.maxExecutionCostUsd)}</dd>
            </div>
            <div>
              <dt>Max duration</dt>
              <dd>{config.profile.maxExecutionMinutes} minutes</dd>
            </div>
            <div>
              <dt>Human approval</dt>
              <dd>Always required</dd>
            </div>
          </dl>
        </section>
        <section>
          <p className="eyebrow">Policy snapshot</p>
          <dl>
            <div>
              <dt>Minimum payout</dt>
              <dd>{money(config.policy.minPayoutUsd)}</dd>
            </div>
            <div>
              <dt>Minimum margin</dt>
              <dd>{money(config.policy.minExpectedMarginUsd)}</dd>
            </div>
            <div>
              <dt>Minimum confidence</dt>
              <dd>{Math.round(config.policy.minConfidence * 100)}%</dd>
            </div>
            <div>
              <dt>Marketplaces</dt>
              <dd>
                {config.policy.allowedMarketplaces.map(pretty).join(", ")}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="contract-section">
        <div className="contract-number">01</div>
        <div>
          <p className="eyebrow">Deterministic plan</p>
          <ol>
            {preview.deterministicPlan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="contract-section">
        <div className="contract-number">02</div>
        <div>
          <p className="eyebrow">Validation criteria</p>
          <ul>
            {preview.validationCriteria.map((criterion) => (
              <li key={criterion}>
                <Check />
                {criterion}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="contract-section danger-contract">
        <div className="contract-number">03</div>
        <div>
          <p className="eyebrow">Refusal conditions</p>
          <ul>
            {preview.refusalConditions.map((condition) => (
              <li key={condition}>
                <CircleStop />
                {condition}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="contract-section">
        <div className="contract-number">04</div>
        <div>
          <p className="eyebrow">Cost accounting · projected, never realized</p>
          <dl className="cost-contract">
            {Object.entries(preview.costAccounting).map(([key, value]) => (
              <div key={key}>
                <dt>
                  <code>{key}</code>
                </dt>
                <dd>{typeof value === "number" ? money(value, 4) : value}</dd>
              </div>
            ))}
          </dl>
          <p className="snapshot-note">
            Expected margin = payout × heuristic success probability − projected
            task execution cost − projected other cost. No inference call
            occurred.
          </p>
          <p className="snapshot-note">
            Safety constraints: human approval required; execution authorized:
            false. Prohibited actions:{" "}
            {config.profile.prohibitedActions.map(pretty).join(", ")}.
          </p>
        </div>
      </section>
      <div className="preview-footer">
        <ShieldCheck />
        <p>
          <strong>Preview ends here.</strong> No approval, download, worker
          invocation, or marketplace action is available.
        </p>
      </div>
    </motion.dialog>
  );
}
