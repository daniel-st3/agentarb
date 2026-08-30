"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { ObjectiveInputSchema, optimizationPolicies } from "@/domain/objective";
import { PlanningResponseSchema } from "@/domain/planning-response";
import { agentCardSchema } from "@/domain/discovery-card";
import { policyLabels } from "@/domain/engine";
import { useResearchSession } from "./session";
const examples = [
  "Build a verified due-diligence route for a startup under $0.25.",
  "Choose the cheapest route to parse and validate a public document.",
  "Design a daily monitoring route for competitor pricing changes.",
];
export function AgentIntegrationProof() {
  const [objective, setObjective] = useState(examples[0]);
  const [budget, setBudget] = useState("0.25");
  const [policy, setPolicy] =
    useState<(typeof optimizationPolicies)[number]>("most_verified");
  const [result, setResult] = useState<z.infer<
    typeof PlanningResponseSchema
  > | null>(null);
  const [card, setCard] = useState<z.infer<typeof agentCardSchema> | null>(
    null,
  );
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [copied, setCopied] = useState("");
  const [transport, setTransport] = useState(""),
    [rpcResponse, setRpcResponse] = useState<unknown>(null);
  const { saveRoute } = useResearchSession();
  const payload = {
    objective,
    budgetUsd: Number(budget),
    optimizationPolicy: policy,
    mode: "demo",
  };
  const tool = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "signalforge_plan_route",
      arguments: {
        objective,
        budget_usd: Number(budget),
        optimization_policy: policy,
      },
    },
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/.well-known/agent-card.json", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return agentCardSchema.parse(await r.json());
      })
      .then(setCard)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function send(mode: "REST" | "MCP") {
    setError("");
    setPending(true);
    setResult(null);
    setRpcResponse(null);
    setTransport(mode);
    try {
      ObjectiveInputSchema.parse(payload);
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      };
      const post = async (url: string, body: unknown) => {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok)
          throw new Error(response.status === 429 ? "limit" : "unavailable");
        return response.json();
      };
      let value: unknown;
      if (mode === "MCP") {
        const initialized = await post("/api/mcp", {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "signalforge-browser-proof", version: "1.0.0" },
          },
        });
        if (!initialized.result?.protocolVersion) throw new Error();
        const rpc = await post("/api/mcp", tool);
        if (rpc.error || rpc.result?.isError) throw new Error();
        value = rpc.result?.structuredContent;
        setRpcResponse(rpc);
      } else value = await post("/api/v1/routes/plan", payload);
      const parsed = PlanningResponseSchema.parse(value);
      setResult(parsed);
      saveRoute(parsed.route);
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? "Use an objective of 12–2,000 characters and a whole-cent budget from $0 to $10."
          : e instanceof Error && e.message === "limit"
            ? "You’ve reached the public sandbox limit. Please try again shortly."
            : "The planning interface is temporarily unavailable. No external execution occurred.",
      );
    } finally {
      setPending(false);
    }
  }
  async function copy(value: unknown, label: string) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(label + " copied.");
    } catch {
      setCopied("Copy unavailable. Select the JSON text instead.");
    }
  }
  return (
    <article className="agent-proof container">
      <p className="eyebrow">DEVELOPER WORKBENCH / REAL HTTP · DEMO PLANNING</p>
      <h1>Call the control plane.</h1>
      <p>A real request. A typed route. No service execution.</p>
      <p className="field-help">
        10 planning requests per client per 10 minutes. MCP shares that quota.
        Optional Groq decomposition may receive the objective; use public,
        non-sensitive context only.
      </p>
      <div className="agent-proof-grid">
        <section>
          <label htmlFor="proof-objective">Agent objective</label>
          <textarea
            id="proof-objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            minLength={12}
            maxLength={2000}
          />
          <div className="command-controls">
            <label>
              BUDGET
              <input
                aria-label="API budget"
                type="number"
                min="0"
                max="10"
                step=".01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
            <label>
              POLICY
              <select
                aria-label="API policy"
                value={policy}
                onChange={(e) => setPolicy(e.target.value as typeof policy)}
              >
                {optimizationPolicies.map((p) => (
                  <option value={p} key={p}>
                    {policyLabels[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="network-actions">
            <button
              className="text-link"
              disabled={pending}
              onClick={() => send("REST")}
            >
              Send REST request ↗
            </button>
            <button
              className="text-link"
              disabled={pending}
              onClick={() => send("MCP")}
            >
              Call MCP planning tool ↗
            </button>
          </div>
          <details>
            <summary>Safe example objectives</summary>
            {examples.map((s, i) => (
              <p key={s}>
                <button
                  className="text-link"
                  onClick={() => {
                    setObjective(s);
                    setPolicy(i === 1 ? "cheapest" : "most_verified");
                    setBudget(i === 2 ? "3" : ".25");
                  }}
                >
                  {s}
                </button>
              </p>
            ))}
          </details>
          <h2>Exact REST payload</h2>
          <pre>{JSON.stringify(payload, null, 2)}</pre>
          <button
            className="text-link"
            onClick={() => copy(payload, "Payload")}
          >
            Copy API payload
          </button>
          <details>
            <summary>MCP tool-call JSON</summary>
            <pre>{JSON.stringify(tool, null, 2)}</pre>
            <button
              className="text-link"
              onClick={() => copy(tool, "Tool call")}
            >
              Copy MCP call
            </button>
          </details>
        </section>
        <section aria-label="Agent integration response">
          <p className="eyebrow">
            {pending
              ? "AWAITING SERVER RESPONSE"
              : result
                ? transport + " / CONTRACT RECEIVED"
                : "RESPONSE / NOT CALLED YET"}
          </p>
          {pending && (
            <p role="status">
              The server is decomposing the objective and compiling a bounded
              route. No task service is executed.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {result ? (
            <>
              <h2>{result.route.objectiveFrame.title}</h2>
              <ol className="proof-trace">
                <li>Objective received</li>
                <li>
                  {result.decompositionSource === "groq"
                    ? "Groq"
                    : "Local demo"}{" "}
                  decomposition returned
                </li>
                <li>
                  Catalog snapshot selected /{" "}
                  {
                    result.freshnessSummary.filter(
                      (s) => s.cachedRecordCount > 0,
                    ).length
                  }{" "}
                  observed sources
                </li>
                <li>
                  Capability coverage checked /{" "}
                  {result.route.unmetRequirements.length} unmet requirements
                </li>
                <li>Route contract compiled / {result.route.status}</li>
                <li>No external execution performed</li>
              </ol>
              <Link
                className="text-link"
                href={`/forge/${result.route.routeId}`}
              >
                Inspect compiled route →
              </Link>
              <pre aria-label="Execution route contract">
                {JSON.stringify(result.route, null, 2)}
              </pre>
              <button
                className="text-link"
                onClick={() => copy(result.route, "Contract")}
              >
                Copy contract JSON
              </button>
              {rpcResponse !== null && (
                <details>
                  <summary>Actual MCP response</summary>
                  <pre>{JSON.stringify(rpcResponse, null, 2)}</pre>
                </details>
              )}
            </>
          ) : (
            !pending && (
              <p>
                Your response will appear here. There are no fabricated example
                responses or hidden calls.
              </p>
            )
          )}
          <details>
            <summary>Agent Card / fetched from this deployment</summary>
            {card ? (
              <pre>{JSON.stringify(card, null, 2)}</pre>
            ) : (
              <p>Agent Card unavailable.</p>
            )}
            <Link href="/.well-known/agent-card.json" className="text-link">
              Open Agent Card →
            </Link>
          </details>
          <p role="status">{copied}</p>
        </section>
      </div>
      <p className="route-boundary">
        execution_not_enabled · Simulated providers · $0 actual service spend ·
        No payments
      </p>
    </article>
  );
}
