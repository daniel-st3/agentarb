import "server-only";
import type { Requester, UpstashRequest } from "@upstash/redis";
import type { LimiterConfig } from "./limiter-config";
import { ROLLING_WINDOW_SCRIPT, WINDOW_MS } from "./rolling-window";
import { readLimitedJson } from "../lib/http-boundary";

/** Dedicated limiter transport: one fixed command, no SDK retries or redirects. */
export function limiterTransport(
  config: Extract<LimiterConfig, { mode: "distributed" }>,
): Requester {
  return {
    async request<TResult>({ body }: UpstashRequest) {
      if (
        !Array.isArray(body) ||
        body.length !== 7 ||
        body[0] !== "eval" ||
        body[1] !== ROLLING_WINDOW_SCRIPT ||
        body[2] !== 1 ||
        typeof body[3] !== "string" ||
        !/^arbiter:public:v1:(discovery|evaluation):[a-f0-9]{64}$/.test(
          body[3],
        ) ||
        body[4] !== (body[3].includes(":discovery:") ? 20 : 10) ||
        body[5] !== WINDOW_MS ||
        typeof body[6] !== "string" ||
        !/^[a-f0-9-]{36}$/.test(body[6])
      )
        throw new Error("Invalid limiter command.");
      const response = await fetch(config.url, {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Limiter unavailable.");
      const payload = await readLimitedJson(response, 4096);
      if (
        !payload ||
        typeof payload !== "object" ||
        "error" in payload ||
        !("result" in payload)
      )
        throw new Error("Invalid limiter response.");
      return { result: payload.result as TResult };
    },
  };
}
