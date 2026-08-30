"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  SlidersHorizontal,
  Link2,
} from "lucide-react";
import { topics } from "@/domain/fixtures";
import {
  policies,
  requestInputSchema,
  RunSchema,
  type RequestInput,
} from "@/domain/schema";
import { policyLabels } from "@/domain/engine";
import { useResearchSession } from "./session";
import { DemoNotice, Eyebrow, StepHeader, money } from "./ui";
const descriptions = {
  best_value: "Balance evidence, cost, reliability, and speed.",
  cheapest: "Lowest cost above the minimum quality threshold.",
  most_verified: "Favor independent corroboration and source diversity.",
  fastest: "Prioritize speed within quality and budget limits.",
};
export function Composer() {
  const [question, setQuestion] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [budget, setBudget] = useState("0.25");
  const [custom, setCustom] = useState(false);
  const [policy, setPolicy] =
    useState<RequestInput["optimizationPolicy"]>("best_value");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { save } = useResearchSession();
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const result = requestInputSchema.safeParse({
      question,
      targetUrl: targetUrl || undefined,
      budgetUsd: budget.trim() ? Number(budget) : NaN,
      optimizationPolicy: policy,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check your request.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      if (!response.ok)
        throw new Error(
          "We couldn't create this route. Check your request and try again.",
        );
      const run = RunSchema.parse(await response.json());
      await save(run);
      router.push(`/forge/${run.request.id}/plan`);
    } catch {
      setError(
        "We couldn't create this route. Check your connection and try again. If your session is full, reload to start fresh.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="composer container">
      <StepHeader step="Request" />
      <div className="composer-heading">
        <Eyebrow>YOUR NEXT RESEARCH BRIEF</Eyebrow>
        <h1>What do you need to know?</h1>
        <p>
          One focused question. A budget you control. Every source accounted
          for.
        </p>
      </div>
      <form className="composer-form" onSubmit={submit}>
        <label htmlFor="question" className="field-label">
          Research request
        </label>
        <textarea
          id="question"
          maxLength={2000}
          minLength={12}
          required
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What is Northstar Search's competitive edge, and what should a buyer verify?"
          aria-describedby="question-help"
        />
        <p id="question-help" className="field-help">
          Demo evidence covers Northstar Search, AtlasGrid, and Lumen Labs—three
          fictional companies. Other questions return an evidence-gap brief.
        </p>
        <div className="target-field">
          <label htmlFor="target">
            <Link2 size={15} />
            Target URL <span>optional · not fetched in demo</span>
          </label>
          <input
            id="target"
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://…"
            maxLength={500}
          />
        </div>
        <div className="composer-controls">
          <fieldset>
            <legend>
              Maximum research budget <span>modeled USD</span>
            </legend>
            <div className="budget-options">
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
              <button
                type="button"
                aria-pressed={custom}
                onClick={() => setCustom(true)}
              >
                Custom
              </button>
            </div>
            {custom && (
              <label className="custom-budget">
                Custom budget ($0–$10)
                <input
                  aria-label="Custom budget"
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </label>
            )}
          </fieldset>
          <fieldset>
            <legend>
              <SlidersHorizontal size={15} />
              Routing policy
            </legend>
            <div className="policy-options">
              {policies.map((p) => (
                <button
                  type="button"
                  key={p}
                  aria-pressed={policy === p}
                  onClick={() => setPolicy(p)}
                >
                  {policyLabels[p]}
                </button>
              ))}
            </div>
            <p className="field-help">{descriptions[policy]}</p>
          </fieldset>
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="composer-bottom">
          <span>Hard budget limit. Actual spend: $0.</span>
          <button className="button" disabled={busy} type="submit">
            {busy ? "Comparing demo services…" : "Forge brief"}
            <ArrowUpRight size={18} />
          </button>
        </div>
        <div aria-live="polite">
          {busy && (
            <p className="loading-note">
              Validating your request and comparing deterministic routes. No
              external calls.
            </p>
          )}
        </div>
      </form>
      <div className="example-prompts">
        <Eyebrow>A GOOD PLACE TO START</Eyebrow>
        {topics.map((topic, i) => (
          <button
            type="button"
            key={topic.name}
            onClick={() => setQuestion(topic.question)}
          >
            <span>0{i + 1}</span>
            <span>{topic.question}</span>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <DemoNotice />
      <p className="privacy-note">
        Your request is processed without application logging or storage. Runs
        remain in this tab’s memory; reloading clears them. Do not enter private
        information.
      </p>
    </div>
  );
}
