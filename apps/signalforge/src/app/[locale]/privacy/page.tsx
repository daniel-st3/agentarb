import { getCopy } from "@/i18n/server";
import { pageMetadata } from "@/i18n/metadata";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => pageMetadata(params, "privacy", "/privacy");
export default async function Privacy() {
  const t = await getCopy();
  return (
    <article className="container arb-privacy">
      <p className="eyebrow">SIGNALFORGE</p>
      <h1>{t("Privacy and execution boundaries")}</h1>
      <h2>{t("Public snapshots and operational privacy")}</h2>
      <p>{t("Upstash stores bounded public source snapshots, validator metadata, connector health, expiring refresh/model-admission leases and rate-limit counters. Caller keys are salted HMACs; SignalForge does not store raw IP addresses in these records.")}</p>
      <p>{t("Only optional objective decomposition sends your objective, context URL, budget, policy and language preference to Groq. The URL is text, not fetched. Marketplace descriptions never enter this model path. No tools, credentials or server configuration are included in the prompt.")}</p>
      <p>{t("SignalForge does not intentionally persist visitor objectives, scenarios or outcomes. Vercel may retain request metadata and operational logs; Groq may retain provider-side logs under its policies. Do not submit confidential text. No marketplace credentials, wallet credentials or private keys are requested; autonomous signing is not available.")}</p>
      <h2>{t("Session-only controls")}</h2>
      <p>
        {t(
          "Policy edits and scenarios stay in this browser session. Downloading a receipt sends the selected scenario to the evaluation API; it is not stored as a marketplace outcome.",
        )}
      </p>
      <h2>{t("Public snapshots, private keys")}</h2>
      <p>
        {t(
          "The server caches bounded public catalog metadata and aggregate connector health. Rate limits use salted identifiers, not stored raw IP addresses. Optional decomposition uses a server-side provider; never enter confidential information.",
        )}
      </p>
      <h2>{t("Execution disabled")}</h2>
      <p>
        {t(
          "SignalForge observes, compares and underwrites. It does not claim work, execute services, submit deliverables or make payments. Simulated economics are not earnings.",
        )}
      </p>
    </article>
  );
}
