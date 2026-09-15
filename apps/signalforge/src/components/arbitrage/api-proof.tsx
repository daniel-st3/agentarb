"use client";
import { useState } from "react";
import { useCopy } from "@/i18n/copy";
import { ArbitrageEvaluationSchema } from "@/domain/arbitrage";
export function ArbitrageApiProof({initialId=""}:{initialId?:string}) {
  const [opportunityId,setId]=useState(initialId);
  const input={opportunityId,responseVersion:"2.0",policy:{minimumMarginBps:2500,requireIndependentVerification:true}};
  const t = useCopy(),
    [result, setResult] = useState<unknown>(null),
    [error, setError] = useState(false),
    [pending, setPending] = useState(false);
  async function send() {
    setPending(true);
    setError(false);
    try {
      const r = await fetch("/api/v1/opportunities/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error();
      const body = await r.json();
      ArbitrageEvaluationSchema.parse(body.evaluation);
      setResult(body);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="container arb-api-proof">
      <p className="eyebrow">REST / MCP · v2.0</p>
      <h2>{t("Arbitrage API proof")}</h2>
      <p>{t("A deterministic evaluation, not a marketplace action.")}</p>
      <div className="arb-thesis-columns">
        <div>
          <h3>POST /api/v1/opportunities/evaluate</h3>
          <label>{t("Opportunity ID")}<input maxLength={240} value={opportunityId} onChange={e=>setId(e.target.value)}/></label>
          <pre>{JSON.stringify(input, null, 2)}</pre>
          <button onClick={send} disabled={pending||!opportunityId}>
            {t("Compile underwriting receipt")} ↗
          </button>
        </div>
        <div>
          <h3>MCP · signalforge_evaluate_opportunity</h3>
          <pre>
            {JSON.stringify(
              {
                opportunity_id: input.opportunityId,
                response_version: "2.0",
                policy: input.policy,
              },
              null,
              2,
            )}
          </pre>
          <p className="mono">execution_not_enabled</p>
        </div>
      </div>
      {error && (
        <p role="alert">
          {t("Receipt unavailable. Please try again shortly.")}
        </p>
      )}
      {result !== null && (
        <details open>
          <summary>{t("Agent handoff / JSON contract")}</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
