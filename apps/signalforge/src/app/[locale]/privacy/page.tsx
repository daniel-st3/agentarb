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
      executionHeading: "Bounded source synthesis",
      execution: "After you explicitly select Run task, SignalForge reads 1–10 public HTTPS pages you supplied and sends bounded extracted text plus your objective to Groq. The source text is untrusted data; no cookies, arbitrary headers, credentials, or secrets are forwarded. Signed-in execution receipts and source URLs are saved privately; guests can download their receipt. Groq may retain provider-side logs.",
      boundary: "Underwriting and marketplace contracts remain execution_not_enabled. Source synthesis is a separate user-authorized route. No marketplace claims, catalog-service fulfillment calls, submissions, wallets, purchases, or autonomous payments are enabled. Receipt hashes are fingerprints, not digital signatures.",
    },
    es: {
      heading: "Cuentas y análisis guardados",
      guest: "Los análisis como visitante no se guardan intencionalmente en una cuenta de SignalForge. Permanecen efímeros salvo que elijas guardarlos después de iniciar sesión.",
      signed: "Con sesión iniciada, los análisis completados en Forge pueden almacenarse en tu historial privado para abrirlos después. Puedes eliminar cada análisis guardado. Supabase almacena identidad, metadatos de perfil y la instantánea validada bajo seguridad por filas.",
      operations: "Vercel y Supabase pueden conservar metadatos operativos y registros según sus políticas. SignalForge no guarda tokens OAuth, credenciales de billetera, claves privadas, IP sin procesar ni huellas del navegador en los análisis guardados.",
      executionHeading: "Síntesis acotada de fuentes",
      execution: "Solo después de elegir Ejecutar tarea, SignalForge lee de 1 a 10 páginas HTTPS públicas indicadas por ti y envía texto acotado junto con tu objetivo a Groq. El texto es dato no confiable; no se reenvían cookies, encabezados arbitrarios, credenciales ni secretos. Los recibos y URL se guardan de forma privada para usuarios autenticados; los invitados pueden descargar su recibo. Groq puede conservar registros.",
      boundary: "Los contratos de evaluación y mercado mantienen execution_not_enabled. La síntesis de fuentes es una ruta separada autorizada por el usuario. No hay reclamaciones de mercado, llamadas a servicios del catálogo, entregas, billeteras, compras ni pagos autónomos. Las huellas de recibos no son firmas digitales.",
    },
    fr: {
      heading: "Comptes et analyses enregistrées",
      guest: "Les analyses invitées ne sont pas volontairement enregistrées dans un compte SignalForge. Elles restent éphémères sauf si vous choisissez de les sauvegarder après connexion.",
      signed: "Une fois connecté, les analyses Forge terminées peuvent être conservées dans votre historique privé. Vous pouvez supprimer chaque analyse. Supabase stocke l’identité, les métadonnées du profil et l’instantané validé sous sécurité au niveau des lignes.",
      operations: "Vercel et Supabase peuvent conserver des métadonnées opérationnelles et des journaux selon leurs politiques. SignalForge ne stocke dans les analyses ni jetons OAuth, ni identifiants de portefeuille, ni clés privées, ni adresses IP brutes, ni empreintes de navigateur.",
      executionHeading: "Synthèse bornée des sources",
      execution: "Après avoir choisi explicitement Exécuter la tâche, SignalForge lit 1 à 10 pages HTTPS publiques fournies par vous et transmet du texte borné avec votre objectif à Groq. Ce texte est une donnée non fiable ; aucun cookie, en-tête arbitraire, identifiant ou secret n’est transmis. Les reçus et URL sont enregistrés de façon privée pour les utilisateurs connectés ; les invités peuvent télécharger leur reçu. Groq peut conserver des journaux.",
      boundary: "Les contrats d’analyse et de marché conservent execution_not_enabled. La synthèse des sources est une route distincte autorisée par l’utilisateur. Aucune réclamation de marché, appel aux services du catalogue, soumission, portefeuille, achat ou paiement autonome n’est activé. Les empreintes de reçus ne sont pas des signatures numériques.",
    },
  }[locale];
  return (
    <article className="container arb-privacy">
      <p className="eyebrow">SIGNALFORGE</p>
      <h1>{t("Privacy and execution boundaries")}</h1>
      <h2>{t("Public snapshots and operational privacy")}</h2>
      <p>{t("Upstash stores bounded public source snapshots, validator metadata, connector health, expiring refresh/model-admission leases and rate-limit counters. Caller keys are salted HMACs; SignalForge does not store raw IP addresses in these records.")}</p>
      <p>{locale === "es" ? "El tipo de cambio USDC/USD puede consultarse a través de un endpoint público de Coinbase. Las observaciones se guardan en caché por entorno; las ejecuciones invitadas no se guardan en un historial de cuenta." : locale === "fr" ? "Le taux USDC/USD peut être consulté via un point d’accès public de Coinbase. Les observations sont mises en cache par environnement ; les exécutions invitées ne sont pas enregistrées dans un historique de compte." : "USDC/USD may be queried from a public Coinbase endpoint. Observations are cached per environment; guest executions are not saved to account history."}</p>
      <h2>{accounts.heading}</h2>
      <p>{accounts.guest}</p>
      <p>{accounts.signed}</p>
      <p>{accounts.operations}</p>
      <h2>{accounts.executionHeading}</h2>
      <p>{accounts.execution}</p>
      <h2>{t("Public snapshots, private keys")}</h2>
      <p>
        {t(
          "The server caches bounded public catalog metadata and aggregate connector health. Rate limits use salted identifiers, not stored raw IP addresses. Optional decomposition uses a server-side provider; never enter confidential information.",
        )}
      </p>
      <h2>{locale === "es" ? "Límites de ejecución" : locale === "fr" ? "Limites d’exécution" : "Execution boundaries"}</h2>
      <p>{accounts.boundary}</p>
    </article>
  );
}
