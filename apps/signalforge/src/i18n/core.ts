export function messageKey(value: string) {
  let hash = 2166136261;
  for (const char of value.trim().replace(/\s+/g, " ")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `m${(hash >>> 0).toString(16)}`;
}
export function translator(messages: Record<string, unknown>) {
  const templates = Object.entries(messages)
    .filter(([key]) => key.startsWith("template:"))
    .map(([key, replacement]) => ({
      pattern: new RegExp(
        "^" +
          decodeURIComponent(key.slice(9))
            .split(/(\{\d+\})/)
            .map((part) =>
              /^\{\d+\}$/.test(part)
                ? "(.+?)"
                : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            )
            .join("") +
          "$",
      ),
      replacement: String(replacement),
    }));
  return function t<T>(value: T): T {
    if (typeof value !== "string") return value;
    const translated = messages[messageKey(value)];
    if (typeof translated === "string") return translated as T;
    for (const { pattern, replacement } of templates) {
      const match = value.match(pattern);
      if (match)
        return replacement.replace(/\{(\d+)\}/g, (_, index) => {
          const token = match[Number(index) + 1] ?? "";
          return String(messages[messageKey(token)] ?? token);
        }) as T;
    }
    return value;
  };
}
