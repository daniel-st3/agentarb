const LABELS: Record<string, string> = {
  research: "Research",
  summarization: "Summarization",
  data_lookup: "Data lookup",
  small_code: "Code planning",
  opentask: "OpenTask",
  execution_market: "execution.market",
  mock: "Controlled demo",
  local_text_transform: "Local text transformation",
  structured_planning: "Structured planning",
};

export function pretty(value: string) {
  return (
    LABELS[value] ??
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function money(value: number | null, precision = 2) {
  return value === null ? "Unknown" : `$${value.toFixed(precision)}`;
}
