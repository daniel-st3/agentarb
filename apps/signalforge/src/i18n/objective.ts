import {
  ObjectiveFrameSchema,
  type ObjectiveFrame,
  type CapabilityId,
} from "@/domain/objective";
export type DisplayLocale = "en" | "es" | "fr";
const labels: Record<CapabilityId, [string, string]> = {
  url_extract: ["Extracción de URL", "Extraction d’URL"],
  structured_profile: ["Perfil de empresa", "Profil d’entreprise"],
  web_research: ["Contexto competitivo", "Contexte concurrentiel"],
  news_search: ["Señales recientes", "Signaux récents"],
  document_parse: ["Análisis de documentos", "Analyse de documents"],
  data_extract: ["Extracción estructurada", "Extraction structurée"],
  change_detection: ["Detección de cambios", "Détection des changements"],
  claim_verification: [
    "Verificación independiente",
    "Vérification indépendante",
  ],
  synthesis: ["Síntesis del resultado", "Synthèse du résultat"],
};
const titles: Record<ObjectiveFrame["objectiveType"], [string, string]> = {
  competitive_intelligence: [
    "Ruta de inteligencia competitiva",
    "Itinéraire de veille concurrentielle",
  ],
  company_analysis: [
    "Ruta de análisis empresarial",
    "Itinéraire d’analyse d’entreprise",
  ],
  document_extraction: [
    "Ruta de extracción documental",
    "Itinéraire d’extraction documentaire",
  ],
  monitoring: [
    "Ruta de seguimiento recurrente",
    "Itinéraire de surveillance récurrente",
  ],
  due_diligence: [
    "Ruta de diligencia debida",
    "Itinéraire de diligence raisonnable",
  ],
  data_enrichment: [
    "Ruta de enriquecimiento de datos",
    "Itinéraire d’enrichissement des données",
  ],
  general_agent_task: [
    "Ruta para el objetivo del agente",
    "Itinéraire pour l’objectif de l’agent",
  ],
};
/** Local display text only: IDs, dependencies, budget and verification stay unchanged. */
export function localizeObjectiveFrame(
  frame: ObjectiveFrame,
  locale: DisplayLocale,
): ObjectiveFrame {
  if (locale === "en") return frame;
  const es = locale === "es",
    column = es ? 0 : 1;
  return ObjectiveFrameSchema.parse({
    ...frame,
    title: titles[frame.objectiveType][column],
    requiredCapabilities: frame.requiredCapabilities.map((c) => ({
      ...c,
      label: labels[c.id][column],
      purpose:
        c.id === "claim_verification"
          ? es
            ? "Exigir fuentes independientes para afirmaciones materiales; detenerse si no hay corroboración."
            : "Exiger des sources indépendantes pour les affirmations importantes ; s’arrêter en l’absence de corroboration."
          : es
            ? `Definir el resultado de ${labels[c.id][column].toLowerCase()} necesario para el objetivo; aún no se ha producido.`
            : `Définir le résultat de ${labels[c.id][column].toLowerCase()} nécessaire à l’objectif ; il n’a pas encore été produit.`,
    })),
    expectedOutput: {
      ...frame.expectedOutput,
      description:
        frame.objectiveType === "monitoring"
          ? es
            ? "Especificación de seguimiento con intervalo, umbral de cambio, costo recurrente y condiciones de parada. No se inicia ningún programador."
            : "Spécification de surveillance avec intervalle, seuil de changement, coût récurrent et conditions d’arrêt. Aucun planificateur n’est démarré."
          : es
            ? "Ruta de capacidades con dependencias, selección de servicios, alternativas y registro de incertidumbre."
            : "Itinéraire de capacités avec dépendances, choix des services, solutions de repli et registre d’incertitude.",
    },
    ambiguities: frame.ambiguities.map((a) =>
      a.startsWith("Provide")
        ? es
          ? "Proporciona una URL pública de contexto antes de cualquier ejecución futura."
          : "Fournissez une URL publique de contexte avant toute exécution future."
        : es
          ? "Aclara el resultado esperado y los criterios medibles de finalización."
          : "Précisez le résultat attendu et les critères mesurables d’achèvement.",
    ),
    routeRationale: es
      ? "Comparar combinaciones de servicios elegibles dentro del presupuesto estricto. Las capacidades críticas y la verificación tienen prioridad. Todo comportamiento de servicios es simulado."
      : "Comparer les combinaisons de services admissibles dans le budget strict. Les capacités critiques et la vérification sont prioritaires. Tout comportement des services est simulé.",
  });
}
