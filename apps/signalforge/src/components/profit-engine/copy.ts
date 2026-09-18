import type { Locale } from "@/i18n/routing";
import { labCopy, type LabCopy } from "@/components/v2-lab/copy";

const productCopy = {
  en: {
    eyebrow: "SIGNALFORGE / AI-AGENT WORK UNDERWRITER",
    headline: "Know if an AI task is worth running.",
    introduction: "Describe a task. SignalForge maps what it needs, checks available AI services, estimates cost and risk, and tells you whether the economics make sense.",
    inspectAction: "INSPECT LIVE WORK",
    underwriteAction: "ANALYZE A TASK",
    controlsLabel: "Profit Engine controls",
    liveWork: "LIVE OBSERVED WORK",
    cachedWork: "CACHED OBSERVED WORK",
    sourceStatus: "OBSERVATION STATUS",
    loading: "Refreshing bounded market observations…",
    unavailable: "Live observations are unavailable. No substitute was inserted.",
    empty: "No qualifying observed work is available in this bounded snapshot.",
    emptyDetail: "Unknown inventory remains unknown. SignalForge never substitutes a demonstration opportunity on the live homepage.",
    openRadar: "OPEN LIVE RADAR",
    productEntry: "PRODUCT ENTRY POINTS",
    entryTitle: "Continue with the evidence.",
    radar: "LIVE RADAR",
    radarDetail: "Inspect bounded observed opportunities and source eligibility.",
    forge: "UNDERWRITING",
    forgeDetail: "Bring an objective into the existing safe route-planning workflow.",
    developers: "DEVELOPERS / API",
    developersDetail: "Call the read-only REST, MCP, and A2A discovery surfaces.",
    receipts: "AUDITABLE RECEIPTS",
    receiptsDetail: "Inspect deterministic decisions, provenance, and receipt fingerprints.",
    trust: "OBSERVED INPUTS · DETERMINISTIC POLICY · UNKNOWN STAYS UNKNOWN",
    boundary: "DISCOVERY + UNDERWRITING ONLY · EXECUTION_NOT_ENABLED",
  },
  es: {
    eyebrow: "SIGNALFORGE / EVALUADOR DE TRABAJO PARA AGENTES",
    headline: "Sabe si vale la pena ejecutar una tarea de IA.",
    introduction: "Describe una tarea. SignalForge identifica lo que necesita, revisa servicios de IA disponibles, estima costo y riesgo, y evalúa si la economía tiene sentido.",
    inspectAction: "EXAMINAR TRABAJO EN VIVO",
    underwriteAction: "ANALIZAR UNA TAREA",
    controlsLabel: "Controles del motor económico",
    liveWork: "TRABAJO OBSERVADO EN VIVO",
    cachedWork: "TRABAJO OBSERVADO EN CACHÉ",
    sourceStatus: "ESTADO DE OBSERVACIÓN",
    loading: "Actualizando observaciones acotadas del mercado…",
    unavailable: "Las observaciones en vivo no están disponibles. No se añadió ningún sustituto.",
    empty: "No hay trabajo observado apto en esta instantánea acotada.",
    emptyDetail: "La disponibilidad desconocida sigue siendo desconocida. SignalForge nunca sustituye una oportunidad de demostración en la página pública.",
    openRadar: "ABRIR RADAR EN VIVO",
    productEntry: "PUNTOS DE ENTRADA",
    entryTitle: "Continúa con la evidencia.",
    radar: "RADAR EN VIVO",
    radarDetail: "Examina oportunidades observadas y acotadas y su elegibilidad de origen.",
    forge: "EVALUACIÓN",
    forgeDetail: "Lleva un objetivo al flujo seguro de planificación de rutas existente.",
    developers: "DESARROLLADORES / API",
    developersDetail: "Usa las superficies REST, MCP y de descubrimiento A2A de solo lectura.",
    receipts: "RECIBOS AUDITABLES",
    receiptsDetail: "Examina decisiones deterministas, procedencia y huellas de recibos.",
    trust: "DATOS OBSERVADOS · POLÍTICA DETERMINISTA · LO DESCONOCIDO NO SE INVENTA",
    boundary: "SOLO DESCUBRIMIENTO + EVALUACIÓN · EXECUTION_NOT_ENABLED",
  },
  fr: {
    eyebrow: "SIGNALFORGE / ANALYSEUR DU TRAVAIL AGENTIQUE",
    headline: "Sachez si une tâche IA mérite d’être exécutée.",
    introduction: "Décrivez une tâche. SignalForge identifie ses besoins, examine les services IA disponibles, estime coût et risque, puis évalue sa viabilité économique.",
    inspectAction: "EXAMINER LE TRAVAIL EN DIRECT",
    underwriteAction: "ANALYSER UNE TÂCHE",
    controlsLabel: "Commandes du moteur économique",
    liveWork: "TRAVAIL OBSERVÉ EN DIRECT",
    cachedWork: "TRAVAIL OBSERVÉ EN CACHE",
    sourceStatus: "ÉTAT DE L’OBSERVATION",
    loading: "Actualisation des observations de marché bornées…",
    unavailable: "Les observations en direct sont indisponibles. Aucun substitut n’a été inséré.",
    empty: "Aucune mission observée admissible n’est disponible dans cet instantané borné.",
    emptyDetail: "Une disponibilité inconnue reste inconnue. SignalForge ne substitue jamais une opportunité de démonstration sur la page publique.",
    openRadar: "OUVRIR LE RADAR EN DIRECT",
    productEntry: "POINTS D’ENTRÉE PRODUIT",
    entryTitle: "Poursuivez avec les preuves.",
    radar: "RADAR EN DIRECT",
    radarDetail: "Examinez les opportunités observées bornées et leur admissibilité de source.",
    forge: "ANALYSE ÉCONOMIQUE",
    forgeDetail: "Transmettez un objectif au flux sûr de planification d’itinéraire existant.",
    developers: "DÉVELOPPEURS / API",
    developersDetail: "Appelez les interfaces REST, MCP et de découverte A2A en lecture seule.",
    receipts: "REÇUS AUDITABLES",
    receiptsDetail: "Examinez les décisions déterministes, la provenance et les empreintes de reçus.",
    trust: "DONNÉES OBSERVÉES · POLITIQUE DÉTERMINISTE · L’INCONNU RESTE INCONNU",
    boundary: "DÉCOUVERTE + ANALYSE UNIQUEMENT · EXECUTION_NOT_ENABLED",
  },
} as const;

export type ProfitEngineCopy = (typeof productCopy)["en"];

export function profitEngineCopy(locale: Locale) {
  const product = productCopy[locale] as ProfitEngineCopy;
  const forge = {
    ...labCopy(locale),
    applyScenario: locale === "es"
      ? "APLICAR ESCENARIO DEL OPERADOR"
      : locale === "fr"
        ? "APPLIQUER LE SCÉNARIO OPÉRATEUR"
        : "APPLY USER SCENARIO",
    scenarioDisclosure: locale === "es"
      ? "No se supone nada hasta que apliques este escenario explícito del operador."
      : locale === "fr"
        ? "Rien n’est supposé avant l’application de ce scénario opérateur explicite."
        : "Nothing is assumed until you apply this explicit operator scenario.",
  } as unknown as LabCopy;
  return { product, forge };
}
