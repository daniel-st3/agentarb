import { getCopy } from "@/i18n/server";
import { pageMetadata } from "@/i18n/metadata";
import { getLocale } from "next-intl/server";
import { safeLocale } from "@/i18n/routing";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => pageMetadata(params, "privacy", "/privacy");
export default async function Privacy() {
  const t = await getCopy();
  const locale = safeLocale(await getLocale());
  const accounts = {
    en: {
      heading: "Accounts and saved analyses",
      guest: "Guest analyses are not intentionally persisted to your SignalForge account. They remain ephemeral unless you choose to save them after signing in.",
      signed: "When signed in, completed Forge analyses may be stored in your private SignalForge history so you can reopen them later. You can delete saved analyses individually. Supabase stores identity, profile metadata, and the validated request/result snapshot under row-level security.",
      operations: "Vercel and Supabase may retain operational metadata and logs under their respective policies. SignalForge does not store OAuth tokens, wallet credentials, private keys, raw IP addresses, or browser fingerprints in saved analyses.",
    },
    es: {
      heading: "Cuentas y análisis guardados",
      guest: "Los análisis como visitante no se guardan intencionalmente en una cuenta de SignalForge. Permanecen efímeros salvo que elijas guardarlos después de iniciar sesión.",
      signed: "Con sesión iniciada, los análisis completados en Forge pueden almacenarse en tu historial privado para abrirlos después. Puedes eliminar cada análisis guardado. Supabase almacena identidad, metadatos de perfil y la instantánea validada bajo seguridad por filas.",
      operations: "Vercel y Supabase pueden conservar metadatos operativos y registros según sus políticas. SignalForge no guarda tokens OAuth, credenciales de billetera, claves privadas, IP sin procesar ni huellas del navegador en los análisis guardados.",
    },
    fr: {
      heading: "Comptes et analyses enregistrées",
      guest: "Les analyses invitées ne sont pas volontairement enregistrées dans un compte SignalForge. Elles restent éphémères sauf si vous choisissez de les sauvegarder après connexion.",
      signed: "Une fois connecté, les analyses Forge terminées peuvent être conservées dans votre historique privé. Vous pouvez supprimer chaque analyse. Supabase stocke l’identité, les métadonnées du profil et l’instantané validé sous sécurité au niveau des lignes.",
      operations: "Vercel et Supabase peuvent conserver des métadonnées opérationnelles et des journaux selon leurs politiques. SignalForge ne stocke dans les analyses ni jetons OAuth, ni identifiants de portefeuille, ni clés privées, ni adresses IP brutes, ni empreintes de navigateur.",
    },
  }[locale];
  return (
    <article className="container arb-privacy">
      <p className="eyebrow">SIGNALFORGE</p>
      <h1>{t("Privacy and execution boundaries")}</h1>
      <h2>{t("Public snapshots and operational privacy")}</h2>
      <p>{t("Upstash stores bounded public source snapshots, validator metadata, connector health, expiring refresh/model-admission leases and rate-limit counters. Caller keys are salted HMACs; SignalForge does not store raw IP addresses in these records.")}</p>
      <p>{t("Only optional objective decomposition sends your objective, context URL, budget, policy and language preference to Groq. The URL is text, not fetched. Marketplace descriptions never enter this model path. No tools, credentials or server configuration are included in the prompt.")}</p>
      <p>{t("SignalForge does not intentionally persist visitor objectives, scenarios or outcomes. Vercel may retain request metadata and operational logs; Groq may retain provider-side logs under its policies. Do not submit confidential text. No marketplace credentials, wallet credentials or private keys are requested; autonomous signing is not available.")}</p>
      <p>{t("A public Coinbase spot-price endpoint may be queried for USDC/USD. SignalForge caches the rate, timestamp and source metadata, never account data. Operator economic assumptions are processed for the requested receipt and are not intentionally persisted. Manual outcome records remain schema-only in this milestone. Shared Redis keys are isolated by a trusted production, preview, development or test namespace.")}</p>
      <h2>{t("Session-only controls")}</h2>
      <p>
        {t(
          "Policy edits and scenarios stay in this browser session. Downloading a receipt sends the selected scenario to the evaluation API; it is not stored as a marketplace outcome.",
        )}
      </p>
      <h2>{accounts.heading}</h2>
      <p>{accounts.guest}</p>
      <p>{accounts.signed}</p>
      <p>{accounts.operations}</p>
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
