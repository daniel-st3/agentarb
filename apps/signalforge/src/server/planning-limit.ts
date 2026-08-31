import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { storeConfig } from "./store-config";

/** Best-effort per-instance protection, NOT a distributed production quota. */
export function createPlanningLimiter(now = () => Date.now(), maximum = 10) {
  const salt = randomBytes(32),
    entries = new Map<string, { count: number; reset: number }>();
  return (request: Request): Response | null => {
    const header =
      request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-forwarded-for");
    const address = header?.split(",")[0]?.trim().toLowerCase();
    if (header && (!address || header.length > 512 || !isIP(address)))
      return Response.json({ error: "Invalid request." }, { status: 400 });
    // Missing address shares one bucket. Never trust a visitor-supplied session ID.
    const normalized =
      address && isIP(address) === 6
        ? new URL(`http://[${address}]`).hostname
        : (address ?? "unknown");
    const key = createHmac("sha256", salt).update(normalized).digest("hex"),
      time = now();
    for (const [k, v] of entries) if (v.reset <= time) entries.delete(k);
    if (!entries.has(key) && entries.size >= 2048)
      return Response.json(
        {
          error:
            "Planning is temporarily unavailable. Please try again shortly.",
        },
        {
          status: 503,
          headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        },
      );
    const bucket = entries.get(key) ?? { count: 0, reset: time + 600000 };
    if (bucket.count >= maximum)
      return Response.json(
        {
          error:
            "You’ve reached the public sandbox limit. Please try again shortly.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil((bucket.reset - time) / 1000)),
            ),
            "Cache-Control": "no-store",
          },
        },
      );
    bucket.count++;
    entries.set(key, bucket);
    return null;
  };
}
const localPlanning = createPlanningLimiter(),
  localCatalog = createPlanningLimiter(undefined, 60),
  localUnderwriting = createPlanningLimiter(undefined, 20);
const responseQuota = new WeakMap<Request, Record<string, string>>();
export const quotaHeaders = (request: Request) =>
  responseQuota.get(request) ?? {};
export async function checkPlanningLimit(
  request: Request,
  category: "planning" | "catalog" | "underwriting" = "planning",
): Promise<Response | null> {
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !==
      `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`
  )
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  try {
    const configured = storeConfig();
    if (!configured) {
      // Local hermetic demos may use bounded per-instance limits. Hosted live APIs may not.
      if (process.env.VERCEL) throw new Error("configuration");
      return (
        category === "planning"
          ? localPlanning
          : category === "underwriting"
            ? localUnderwriting
            : localCatalog
      )(request);
    }
    if (!process.env.RATE_LIMIT_SALT || process.env.RATE_LIMIT_SALT.length < 32)
      throw new Error("configuration");
    const header =
        request.headers.get("x-vercel-forwarded-for") ??
        request.headers.get("x-forwarded-for"),
      address = header?.split(",")[0]?.trim().toLowerCase();
    if (process.env.VERCEL && !request.headers.get("x-vercel-forwarded-for"))
      throw new Error("caller_metadata");
    if (header && (header.length > 512 || !address || !isIP(address)))
      return Response.json({ error: "Invalid request." }, { status: 400 });
    const normalized =
      address && isIP(address) === 6
        ? new URL(`http://[${address}]`).hostname
        : (address ?? "unknown");
    const key = createHmac("sha256", process.env.RATE_LIMIT_SALT)
      .update(normalized)
      .digest("hex");
    const limiter = new Ratelimit({
      redis: new Redis({
        ...configured,
        retry: false,
        signal: () => AbortSignal.timeout(2500),
      }),
      limiter: Ratelimit.slidingWindow(
        category === "planning" ? 10 : category === "underwriting" ? 20 : 60,
        "10 m",
      ),
      prefix: `sf:limit:v2:${category}`,
      analytics: false,
      timeout: 2000,
    });
    const result = await limiter.limit(key);
    if (
      result.reason === "timeout" ||
      typeof result.success !== "boolean" ||
      !Number.isFinite(result.reset)
    )
      throw new Error("unavailable");
    const quota = {
      "RateLimit-Limit": String(
        category === "planning" ? 10 : category === "underwriting" ? 20 : 60,
      ),
      "RateLimit-Remaining": String(Math.max(0, result.remaining)),
      "RateLimit-Reset": String(
        Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      ),
    };
    responseQuota.set(request, quota);
    return result.success
      ? null
      : Response.json(
          {
            error:
              "You’ve reached the public sandbox limit. Please try again shortly.",
          },
          {
            status: 429,
            headers: {
              ...quota,
              "Retry-After": String(
                Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
              ),
              "Cache-Control": "no-store",
            },
          },
        );
  } catch (error) {
    const category =
      error instanceof Error &&
      ["configuration", "store_unavailable", "caller_metadata"].includes(
        error.message,
      )
        ? error.message === "caller_metadata"
          ? "caller_metadata"
          : "configuration"
        : "durable_unavailable";
    console.warn("public_protection_unavailable", { category });
    return Response.json(
      {
        error:
          "The public service is temporarily unavailable. Please try again shortly.",
      },
      {
        status: 503,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      },
    );
  }
}
