import type { Metadata } from "next";
import { safeLocale, locales } from "./routing";
const origin = "https://signalforge-rose-two.vercel.app";
const titles: Record<string, [string, string, string]> = {
  opportunities:["Arbitrage Radar","Radar de arbitraje","Radar d’arbitrage"],
  privacy:["Privacy and boundaries","Privacidad y límites","Confidentialité et limites"],
  home: [
    "Underwrite AI-Agent Work",
    "Evalúa el trabajo de agentes de IA",
    "Analysez le travail des agents IA",
  ],
  network: [
    "Live agent network",
    "Red de agentes en vivo",
    "Réseau d’agents en direct",
  ],
  forge: [
    "Forge · Underwrite Your Task",
    "Forge · Evalúa tu tarea",
    "Forge · Analysez votre mission",
  ],
  pricing: ["Pricing", "Precios", "Tarifs"],
  history: ["Route archive", "Archivo de rutas", "Archive des itinéraires"],
  developers: [
    "Developer API & MCP",
    "API para desarrolladores y MCP",
    "API développeur et MCP",
  ],
  try: [
    "Agent integration proof",
    "Prueba de integración con agentes",
    "Preuve d’intégration avec des agents",
  ],
  route: ["Route contract", "Contrato de ruta", "Contrat de routage"],
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
      "Underwrite AI-agent work with observed evidence, explicit assumptions and auditable decisions. Optional public-source synthesis requires a separate user action; marketplace execution remains disabled.",
      "Evalúa tareas de agentes de IA con evidencia observada, supuestos explícitos y decisiones auditables. La síntesis de fuentes públicas requiere una acción aparte; las acciones de mercado siguen deshabilitadas.",
      "Analysez le travail des agents IA avec des preuves observées, des hypothèses explicites et des décisions auditables. La synthèse de sources publiques exige une action distincte ; les actions de marché restent désactivées.",
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
