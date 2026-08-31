import type { Metadata } from "next";
import { safeLocale, locales } from "./routing";
const origin = "https://signalforge-rose-two.vercel.app";
const titles: Record<string, [string, string, string]> = {
  home: [
    "Agent-routing intelligence",
    "Inteligencia para rutas de agentes",
    "Intelligence d’itinéraires pour agents",
  ],
  network: [
    "Live agent network",
    "Red de agentes en vivo",
    "Réseau d’agents en direct",
  ],
  forge: [
    "Agent objective console",
    "Consola de objetivos del agente",
    "Console d’objectifs de l’agent",
  ],
  history: ["Route archive", "Archivo de rutas", "Archive des itinéraires"],
  developers: [
    "Demo planning API & MCP",
    "API de planificación de demostración y MCP",
    "API de planification de démonstration et MCP",
  ],
  try: [
    "Agent integration proof",
    "Prueba de integración con agentes",
    "Preuve d’intégration avec des agents",
  ],
  route: ["Execution route", "Ruta de ejecución", "Itinéraire d’exécution"],
  plan: ["Capability route", "Ruta de capacidades", "Itinéraire de capacités"],
  output: [
    "Simulated research output",
    "Resultado de investigación simulado",
    "Résultat de recherche simulé",
  ],
};
export async function pageMetadata(
  params: Promise<{ locale: string; id?: string }>,
  page: keyof typeof titles,
  path = "",
): Promise<Metadata> {
  const p = await params,
    locale = safeLocale(p.locale),
    column = locales.indexOf(locale);
  const suffix = path.replace("[id]", encodeURIComponent(p.id ?? ""));
  return {
    title: `${titles[page][column]} · SignalForge`,
    description: [
      "Agent objectives become budget-constrained route contracts. Public catalog observation only; services are never executed or paid.",
      "Los objetivos de agentes se convierten en contratos de ruta con presupuesto limitado. Solo observación de catálogos públicos; nunca se ejecutan ni pagan servicios.",
      "Les objectifs d’agents deviennent des contrats d’itinéraire à budget limité. Observation de catalogues publics uniquement ; aucun service n’est exécuté ni payé.",
    ][column],
    alternates: {
      canonical: `${origin}/${locale}${suffix}`,
      languages: {
        ...Object.fromEntries(
          locales.map((l) => [l, `${origin}/${l}${suffix}`]),
        ),
        "x-default": `${origin}/en${suffix}`,
      },
    },
    ...(p.id ? { robots: { index: false, follow: true } } : {}),
  };
}
