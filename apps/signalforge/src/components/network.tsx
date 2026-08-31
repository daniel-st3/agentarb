"use client";
import { useCopy } from "@/i18n/copy";

import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ResultTransition, TechnicalLabel } from "./interactions/primitives";
import Link from "@/i18n/navigation";
import {
  NetworkResponseSchema,
  matchListing,
  compareListings,
  CatalogQuerySchema,
  type NetworkResponse,
  type Listing,
} from "@/domain/intelligence";
import { capabilityIds } from "@/domain/objective";
import { money } from "./ui";
import { candidateSources } from "@/server/intelligence/connectors/candidates";
const labels: Record<string, string> = {
  live: "LIVE OBSERVATION",
  cached_live: "CACHED LIVE",
  seeded_catalog: "STATIC CATALOG SEED",
  simulated_demo: "SIMULATED DEMO",
  unavailable: "UNAVAILABLE",
  error: "SOURCE ERROR",
};
function ListingDetail({ listing: l }: { listing: Listing }) {
  const t = useCopy();

  const service = l.listingType === "service_offer",
    price = service ? l.pricing : l.payout,
    caps = service ? l.capabilities : l.requiredCapabilities;
  const [evaluation, setEvaluation] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [shellOpen, setShellOpen] = useState(false);
  async function evaluate() {
    setEvaluation("Evaluating structured assumptions…");
    try {
      const response = await fetch("/api/v1/opportunities/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: l.id,
          agentProfile: "default_demo_profile",
        }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setEvaluation(
        typeof result.reason === "string"
          ? result.reason
          : "Evaluation unavailable.",
      );
    } catch {
      setEvaluation(
        "Evaluation is temporarily unavailable. No marketplace action occurred.",
      );
    }
  }
  return (
    <details className="catalog-row" open={shellOpen}>
      <summary
        aria-expanded={expanded}
        onClick={(event) => {
          event.preventDefault();
          if (!expanded) setShellOpen(true);
          setExpanded(!expanded);
        }}
      >
        <div>
          <h3>{t(service ? l.name : l.title)}</h3>
          <p>
            {t(l.sourceName)} /{" "}
            {t(service ? "SERVICE CATALOG" : "TASK OPPORTUNITY")}
          </p>
          <p>{caps.join(" · ") || "Capability not established"}</p>
        </div>
        <div>
          <span className="eyebrow">{t(service ? "PRICE" : "PAYOUT")}</span>
          <p>
            {t(
              price.amountUsd !== undefined
                ? money(price.amountUsd)
                : "Unknown",
            )}{" "}
            · {t(price.parseConfidence)}
          </p>
        </div>
        <span className={`catalog-freshness fresh-${l.freshness}`}>
          {t(labels[l.freshness])}
          <br />
          {t(service ? l.access.actionability : l.actionability)}
        </span>
      </summary>
      <AnimatePresence
        onExitComplete={() => {
          if (!expanded) setShellOpen(false);
        }}
      >
        {expanded && (
          <ResultTransition key="detail">
            <div className="catalog-description">
              <p>{t(l.description)}</p>
              {service && l.access.actionability === "catalog_only" && (
                <p>
                  <TechnicalLabel term="catalog_only" />
                </p>
              )}
              <dl>
                <dt>{t("Observed / catalog updated")}</dt>
                <dd>
                  {l.observedAt} / {l.sourceUpdatedAt ?? t("not supplied")}
                </dd>
                <dt>{t("Price interpretation")}</dt>
                <dd>
                  {t(price.parseConfidence)} ·{" "}
                  {t(
                    service
                      ? (l.pricing.rawPriceText ??
                          "No structured live price supplied.")
                      : (l.payout.rawPayoutText ??
                          "No structured payout supplied."),
                  )}
                </dd>
                {t(
                  service ? (
                    <>
                      <dt>{t("Access requirements")}</dt>
                      <dd>
                        {t(
                          l.access.requirementsKnown
                            ? "Modeled demo requirements only."
                            : "Unknown: do not infer that credentials, reputation, or other access gates are unnecessary.",
                        )}
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt>{t("Claim / settlement / reputation")}</dt>
                      <dd>
                        {l.claimModel} / {l.settlement} /{" "}
                        {l.reputationRequirement ?? "unknown"}
                      </dd>
                    </>
                  ),
                )}
                <dt>{t("Source / reference")}</dt>
                <dd>
                  <a
                    href={l.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    {t("Inspect source metadata ↗")}
                  </a>{" "}
                  · {l.rawReference ?? l.id}
                </dd>
                {l.termsUrl && (
                  <>
                    <dt>{t("Access / reuse assessment")}</dt>
                    <dd>
                      <a
                        className="text-link"
                        href={l.termsUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {t("Source terms or license ↗")}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
              {l.dataQuality.warnings.map((w) => (
                <p key={w} className="field-help">
                  {t(w)}
                </p>
              ))}
              <p className="catalog-boundary">
                <TechnicalLabel term="execution_not_enabled" /> ·{" "}
                {t(
                  service
                    ? "Catalog fit is not execution eligibility."
                    : "Evaluation only. SignalForge cannot bid, claim, accept, submit, or settle this opportunity.",
                )}
              </p>
              <div className="network-actions">
                <Link
                  className="text-link"
                  href={`/forge?capability=${encodeURIComponent(caps[0] ?? "web_research")}&listing=${encodeURIComponent(l.id)}`}
                >
                  {t("Forge a route for this capability →")}
                </Link>
                {!service && (
                  <button className="text-link" onClick={evaluate}>
                    {t("Evaluate as opportunity")}
                  </button>
                )}
              </div>
              {evaluation && <p role="status">{t(evaluation)}</p>}
            </div>
          </ResultTransition>
        )}
      </AnimatePresence>
    </details>
  );
}
export function NetworkExplorer({initial,initialFilters={}}:{initial?:NetworkResponse;initialFilters?:Record<string,string>}) {
  const t = useCopy();

  const [network, setNetwork] = useState<NetworkResponse | null>(initial??null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!initial),
    [ready, setReady] = useState(false),
    [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  useEffect(() => {
    const restore = () => {
      const raw = Object.fromEntries(
        new URLSearchParams(window.location.search),
      );
      const parsed = CatalogQuerySchema.safeParse(raw);
      setFilters(
        parsed.success
          ? Object.fromEntries(
              Object.entries(parsed.data)
                .filter(([k]) => k !== "limit")
                .map(([k, v]) => [k, String(v)]),
            )
          : {},
      );
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const filterQuery = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (filterQuery ? "?" + filterQuery : ""),
    );
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      fetch("/api/v1/catalog?limit=50&" + filterQuery, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              response.status === 429
                ? "You’ve reached the public sandbox limit. Please try again shortly."
                : "Live discovery is unavailable. You can still forge a controlled demo route.",
            );
          const value = await response.json();
          const { matchedCount: _, truncated: __, ...data } = value;
          void _;
          void __;
          setNetwork(NetworkResponseSchema.parse(data));
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error &&
                e.message ===
                  "You’ve reached the public sandbox limit. Please try again shortly."
                ? e.message
                : "Live discovery is unavailable. You can still forge a controlled demo route.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filterQuery, ready]);
  const query = CatalogQuerySchema.parse({
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      limit: 50,
    }),
    records =
      network?.records
        .filter((l) => matchListing(l, query))
        .sort((a, b) => compareListings(a, b, query)) ?? [];
  const select = (key: string, label: string, values: string[]) => (
    <label>
      {t(label)}
      <select
        aria-label={t(label)}
        value={filters[key] ?? ""}
        onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
      >
        <option value="">{t("All")}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {t(v.replaceAll("_", " "))}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="network-page container">
      <header>
        <p className="eyebrow">{t("SIGNALFORGE / LIVE AGENT NETWORK")}</p>
        <h1>
          {t("Observe the supply side")}
          <br />
          {t("of the agent web.")}
        </h1>
        <p className="network-intro">
          {t(
            "Inspect public catalog metadata, capability matches, freshness, and access constraints before planning a route.",
          )}
        </p>
        <p className="route-boundary">
          {t(
            "Discovery only. SignalForge does not bid, claim, pay, or execute marketplace actions.",
          )}
        </p>
      </header>
      {loading && (
        <p role="status">{t("Reading bounded catalog snapshots…")}</p>
      )}
      {error && <p role="alert">{t(error)}</p>}
      {network && (
        <>
          <div
            className="source-rail"
            aria-label={t("Source health and observation timestamps")}
          >
            {network.sources.map((s) => (
              <div
                className="source-row"
                data-freshness={s.freshness}
                key={s.connectorId}
              >
                <div>
                  <h2>{t(s.name)}</h2>
                  <p>{t(s.accessMode.replaceAll("_", " "))}</p>
                </div>
                <div>
                  <p>
                    {t(s.status.toUpperCase())} / {t(labels[s.freshness])}
                  </p>
                  <p>
                    {t(s.cachedRecordCount)} {t("records in bounded sample")}
                  </p>
                </div>
                <div>
                  <p>
                    {t("LAST OBSERVED")}
                    <br />
                    {t(
                      s.lastSuccessAt ? (
                        <time dateTime={s.lastSuccessAt}>
                          {s.lastSuccessAt}
                        </time>
                      ) : (
                        "No successful observation"
                      ),
                    )}
                  </p>
                  <p>
                    {t("NEXT ELIGIBLE REFRESH")}
                    <br />
                    {t(
                      s.nextRefreshAfter ? (
                        <time dateTime={s.nextRefreshAfter}>
                          {s.nextRefreshAfter}
                        </time>
                      ) : (
                        "Unavailable"
                      ),
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="field-help">
            {t(
              network.cacheMode === "shared"
                ? "Shared cache / server-enforced refresh leases."
                : "NON-DURABLE DEMO CACHE · Best-effort per-instance rate limits and hourly refresh control. Production hardening requires a shared store.",
            )}
          </p>
          <div className="network-filters">
            <label className="network-search">
              {t("Search this bounded sample")}
              <input
                placeholder={t("Search names, capabilities, sources")}
                maxLength={120}
                value={filters.query ?? ""}
                onChange={(e) =>
                  setFilters({ ...filters, query: e.target.value })
                }
              />
            </label>
            {select("capability", "Capability", [...capabilityIds])}
            {select("source", "Source", [
              ...network.sources.map((s) => s.connectorId),
              "demo",
            ])}
            {select("listingType", "Listing type", [
              "service_offer",
              "task_opportunity",
            ])}
            {select("freshness", "Freshness", [
              "live",
              "cached_live",
              "seeded_catalog",
              "simulated_demo",
            ])}
            {select("priceModel", "Price model", [
              "free",
              "per_call",
              "per_token",
              "subscription",
              "quote_required",
              "unknown",
            ])}
            {select("sort", "Sort order", [
              "route_fit",
              "structured_price",
              "freshest",
              "reliability",
              "newest",
            ])}
            {select("availability", "Availability", [
              "observed",
              "demo",
              "unavailable",
            ])}
            {select("actionability", "Observed access", [
              "catalog_only",
              "requires_bid",
              "execution_not_enabled",
              "unknown",
            ])}
          </div>
          <p className="eyebrow" aria-live="polite">
            {t(records.length)} {t("MATCHES / EXECUTION NOT ENABLED")}
          </p>
          <p className="field-help">
            {t(
              "At most 50 matches per query. Price sorting compares exact USD per-call quotes only; missing prices and measured reliability sort last. “Newest” uses source update dates when supplied.",
            )}
          </p>
          <div
            className="catalog-results"
            aria-label={t("Catalog results")}
            aria-busy={loading}
          >
            <AnimatePresence initial={false} mode="wait">
              <ResultTransition key={records.map((r) => r.id).join("|")}>
                {[
                  "live",
                  "cached_live",
                  "seeded_catalog",
                  "simulated_demo",
                ].map((state) => {
                  const rows = records.filter((r) => r.freshness === state);
                  return rows.length ? (
                    <section key={state} aria-label={t(labels[state])}>
                      <div
                        className={`catalog-freshness fresh-${state}`}
                        style={{ margin: "32px 0 16px" }}
                      >
                        {t(labels[state])}
                        {state === "cached_live" && (
                          <>
                            {" "}
                            / <TechnicalLabel term="cached_live" />
                          </>
                        )}
                      </div>
                      {rows.map((l) => (
                        <ListingDetail listing={l} key={l.id} />
                      ))}
                    </section>
                  ) : null;
                })}
                {!records.length && (
                  <p>
                    {t(
                      "No matching records in this sample. Unknown capabilities and prices are not inferred as eligible.",
                    )}
                  </p>
                )}
              </ResultTransition>
            </AnimatePresence>
          </div>
          <p className="field-help">{network.warnings.join(" ")}</p>
        </>
      )}
      <details className="route-ledger">
        <summary>{t("Sources not enabled")}</summary>
        {candidateSources.map((s) => (
          <p key={s.id}>
            <strong>
              {t(s.name)} {t("/ DISABLED")}
            </strong>{" "}
            — {t(s.reason)}
          </p>
        ))}
        <p>
          {t(
            "Task marketplaces, Bazaar, and external Agent Cards remain disabled where public redistribution or access requirements have not been verified. No disabled source is represented as live.",
          )}
        </p>
        <Link
          href="https://github.com/daniel-st3/agentarb/blob/claude/verify-bounty-api-facts-f6ccdu/docs/live-sources.md"
          className="text-link"
        >
          {t("Source assessments and limitations ↗")}
        </Link>
      </details>
      <div className="network-actions">
        <Link href="/forge" className="text-link">
          {t("Use this supply data to forge a route →")}
        </Link>
        <Link href="/developers" className="text-link">
          {t("Demo API & MCP tools →")}
        </Link>
      </div>
    </section>
  );
}
