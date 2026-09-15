import "server-only";
import { z } from "zod";
import { AgentBountiesDiagnosticError } from "./diagnostics";
export const discoveryEndpoints = {
  agentbounties:
    "https://api.agentbounties.app/v1/opportunities/feed.json?network=base-mainnet&view=ready_to_earn&source_type=canonical_base&work_state=claimable&payment_state=escrowed&limit=30",
  agentbountiesState:
    "https://api.agentbounties.app/v1/opportunities?network=base-mainnet&view=ready_to_earn&source_type=canonical_base&work_state=claimable&payment_state=escrowed&limit=30",
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
  conditional?: { etag?: string; lastModified?: string },
  metadata?: { etag?: string; lastModified?: string; notModified?: boolean },
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
        headers: {
          Accept: "application/json",
          ...(source === "agentbounties" &&
          conditional?.etag &&
          /^[\x20-\x7e]{1,200}$/.test(conditional.etag)
            ? { "If-None-Match": conditional.etag }
            : {}),
          ...(source === "agentbounties" &&
          conditional?.lastModified &&
          /^[\x20-\x7e]{1,100}$/.test(conditional.lastModified)
            ? { "If-Modified-Since": conditional.lastModified }
            : {}),
        },
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (response.status === 304 && source === "agentbounties" && metadata) {
        metadata.notModified = true;
        return null;
      }
      if (metadata) {
        metadata.etag = response.headers.get("etag")?.slice(0, 200);
        metadata.lastModified = response.headers
          .get("last-modified")
          ?.slice(0, 100);
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (
          (source === "agentbounties" || source === "agentbountiesState") &&
          response.status >= 300 &&
          response.status < 400
        )
          throw new AgentBountiesDiagnosticError("agentbounties_redirect");
        if (response.status >= 500 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        if (source === "agentbounties" || source === "agentbountiesState")
          throw new AgentBountiesDiagnosticError(
            response.status >= 500
              ? "agentbounties_http_5xx"
              : "agentbounties_http_4xx",
          );
        throw new Error("upstream_unavailable");
      }
      const mediaType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (
        !(
          mediaType === "application/json" ||
          (source === "agentbounties" &&
            mediaType === "application/feed+json") ||
          (source === "litellm" && mediaType === "text/plain")
        )
      ) {
        await response.body?.cancel();
        if (source === "agentbounties" || source === "agentbountiesState")
          throw new AgentBountiesDiagnosticError(
            "agentbounties_invalid_content_type",
          );
        throw new Error("invalid_payload");
      }
      if (Number(response.headers.get("content-length") ?? 0) > byteLimit) {
        await response.body?.cancel();
        if (source === "agentbounties" || source === "agentbountiesState")
          throw new AgentBountiesDiagnosticError(
            "agentbounties_payload_too_large",
          );
        throw new Error("invalid_payload");
      }
      const reader = response.body?.getReader();
      if (!reader) {
        if (source === "agentbounties" || source === "agentbountiesState")
          throw new AgentBountiesDiagnosticError("agentbounties_invalid_json");
        throw new Error("invalid_payload");
      }
      let text = "",
        size = 0;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > byteLimit) {
            if (source === "agentbounties" || source === "agentbountiesState")
              throw new AgentBountiesDiagnosticError(
                "agentbounties_payload_too_large",
              );
            throw new Error("invalid_payload");
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel();
      }
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        if (source === "agentbounties" || source === "agentbountiesState")
          throw new AgentBountiesDiagnosticError("agentbounties_invalid_json");
        throw new Error("invalid_payload");
      }
      if (source === "agentbounties") {
        const feed = z
          .object({
            version: z.literal("https://jsonfeed.org/version/1.1"),
            items: z.array(z.object({ id: z.string().max(300) })).max(30),
          })
          .safeParse(payload);
        if (!feed.success)
          throw new AgentBountiesDiagnosticError(
            "agentbounties_feed_schema_changed",
          );
        // JSON Feed validators gate polling; the typed projection preserves deadlines,
        // competition phase and eligibility fields omitted by the feed representation.
        return publicDiscoveryGet("agentbountiesState", fetcher);
      }
      return payload;
    } catch (error) {
      if (error instanceof AgentBountiesDiagnosticError) throw error;
      if (
        (source === "agentbounties" || source === "agentbountiesState") &&
        (error instanceof DOMException || error instanceof Error) &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      )
        throw new AgentBountiesDiagnosticError("agentbounties_timeout");
      if (attempt === 0 && error instanceof TypeError) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      if (source === "agentbounties" || source === "agentbountiesState")
        throw new AgentBountiesDiagnosticError(
          error instanceof TypeError && /redirect/i.test(error.message)
            ? "agentbounties_redirect"
            : "agentbounties_network_error",
        );
      throw new Error("upstream_unavailable");
    }
  }
  throw new Error("upstream_unavailable");
}
