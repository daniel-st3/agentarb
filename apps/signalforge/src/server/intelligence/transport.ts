import "server-only";
export const discoveryEndpoints = {
  mcp: "https://registry.modelcontextprotocol.io/v0.1/servers?limit=30&version=latest&search=search",
  apisguru: "https://api.apis.guru/v2/nytimes.com.json",
  modelsdev: "https://models.dev/api.json",
  litellm:
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
} as const;
/** No URL input, headers, body, redirects, payment or credential surface. */
export async function publicDiscoveryGet(
  source: keyof typeof discoveryEndpoints,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  if (!Object.hasOwn(discoveryEndpoints, source))
    throw new Error("unsupported_source");
  const byteLimit =
    source === "modelsdev"
      ? 6_000_000
      : source === "litellm"
        ? 4_000_000
        : 1_000_000;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(discoveryEndpoints[source], {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        throw new Error("upstream_unavailable");
      }
      if (
        !(
          response.headers.get("content-type")?.includes("json") ||
          (source === "litellm" &&
            response.headers.get("content-type")?.startsWith("text/plain"))
        ) ||
        Number(response.headers.get("content-length") ?? 0) > byteLimit
      ) {
        await response.body?.cancel();
        throw new Error("invalid_payload");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("invalid_payload");
      let text = "",
        size = 0;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > byteLimit) throw new Error("invalid_payload");
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel();
      }
      return JSON.parse(text);
    } catch (error) {
      if (attempt === 0 && error instanceof TypeError) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      throw new Error("upstream_unavailable");
    }
  }
  throw new Error("upstream_unavailable");
}
