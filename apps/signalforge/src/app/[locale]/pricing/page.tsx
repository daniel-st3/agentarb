import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import Link from "@/i18n/navigation";
import { pageMetadata } from "@/i18n/metadata";
import { locales, type Locale } from "@/i18n/routing";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> =>
  pageMetadata(params, "pricing", "/pricing");

const copy = {
  en: {
    eyebrow: "SIGNALFORGE / PRICING",
    title: "Start with the economics.",
    intro: "Use SignalForge without an account. Paid plans are published for product direction only; billing is not available yet.",
    month: "/mo",
    available: "AVAILABLE NOW",
    soon: "COMING SOON",
    action: "ANALYZE A TASK",
    boundary: "No checkout is active. A Colombia-compatible billing provider has not been selected.",
    tiers: [
      ["Free", "$0", "Run guest underwriting, inspect live market evidence, and download receipts."],
      ["Pro", "$29", "Planned saved-analysis capacity, deeper scenario comparison, and personal watches."],
      ["Builder", "$99", "Planned higher API allowances, developer workflows, and programmatic history."],
    ],
  },
  es: {
    eyebrow: "SIGNALFORGE / PRECIOS",
    title: "Empieza por la economía.",
    intro: "Usa SignalForge sin una cuenta. Los planes pagos solo muestran la dirección del producto; la facturación aún no está disponible.",
    month: "/mes",
    available: "DISPONIBLE AHORA",
    soon: "PRÓXIMAMENTE",
    action: "ANALIZAR UNA TAREA",
    boundary: "No hay un proceso de pago activo. Aún no se ha elegido un proveedor de facturación compatible con Colombia.",
    tiers: [
      ["Free", "$0", "Ejecuta análisis como invitado, examina evidencia de mercado y descarga recibos."],
      ["Pro", "$29", "Capacidad planificada para análisis guardados, comparación de escenarios y alertas personales."],
      ["Builder", "$99", "Límites de API, flujos para desarrolladores e historial programático planificados."],
    ],
  },
  fr: {
    eyebrow: "SIGNALFORGE / TARIFS",
    title: "Commencez par l’économie.",
    intro: "Utilisez SignalForge sans compte. Les offres payantes indiquent seulement la direction du produit ; la facturation n’est pas encore disponible.",
    month: "/mois",
    available: "DISPONIBLE",
    soon: "BIENTÔT",
    action: "ANALYSER UNE TÂCHE",
    boundary: "Aucun paiement n’est actif. Un prestataire de facturation compatible avec la Colombie reste à sélectionner.",
    tiers: [
      ["Free", "$0", "Analysez en tant qu’invité, examinez les preuves du marché et téléchargez les reçus."],
      ["Pro", "$29", "Capacité planifiée pour les analyses enregistrées, les scénarios et les alertes personnelles."],
      ["Builder", "$99", "Quotas API, flux développeur et historique programmatique planifiés."],
    ],
  },
} as const;

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(locales, rawLocale)) notFound();
  const locale = rawLocale as Locale;
  const text = copy[locale];

  return (
    <div className="pricing-page container">
      <header>
        <p className="eyebrow">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p>{text.intro}</p>
      </header>
      <div className="pricing-grid" aria-label={text.eyebrow}>
        {text.tiers.map(([name, price, detail], index) => (
          <article key={name}>
            <span>0{index + 1}</span>
            <h2>{name}</h2>
            <p className="pricing-amount">{price}<small>{index === 0 ? "" : text.month}</small></p>
            <p>{detail}</p>
            {index === 0 ? <Link href="/forge">{text.action} →</Link> : <strong>{text.soon}</strong>}
            <small>{index === 0 ? text.available : text.soon}</small>
          </article>
        ))}
      </div>
      <p className="pricing-boundary">{text.boundary}</p>
    </div>
  );
}
