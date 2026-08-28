import "server-only";
import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { limiterConfig } from "./limiter-config";
import { clientKey, isLocalRequest } from "./client-key";
import { limiterTransport } from "./redis-transport";
import {
  LIMITS,
  WINDOW_MS,
  ROLLING_WINDOW_SCRIPT,
  type ProtectedRoute,
} from "./rolling-window";

const LIMIT_MESSAGE =
  "You’ve reached the public sandbox limit. Please try again shortly.";
const UNAVAILABLE_MESSAGE =
  "The public sandbox is temporarily unavailable. Please try again shortly.";
// Only the explicit loopback development path uses memory. Production never reads it.
const localRequests: Partial<Record<ProtectedRoute, number[]>> = {};

function denied(status: 429 | 503, retry: number) {
  return NextResponse.json(
    { error: status === 429 ? LIMIT_MESSAGE : UNAVAILABLE_MESSAGE },
    {
      status,
      headers: { "Cache-Control": "no-store", "Retry-After": String(retry) },
    },
  );
}

export async function enforcePublicLimit(
  request: Request,
  route: ProtectedRoute,
): Promise<Response | null> {
  try {
    const config = limiterConfig();
    if (config.mode === "local") {
      if (!isLocalRequest(request)) return denied(503, 30);
      const now = Date.now();
      const events = (localRequests[route] ?? []).filter(
        (time) => time > now - WINDOW_MS,
      );
      localRequests[route] = events;
      if (events.length >= LIMITS[route])
        return denied(
          429,
          Math.max(1, Math.ceil((events[0] + WINDOW_MS - now) / 1000)),
        );
      events.push(now);
      return null;
    }
    const key = `arbiter:public:v1:${route}:${clientKey(request, config.salt)}`;
    const redis = new Redis(limiterTransport(config));
    const decision: unknown = await redis.eval(
      ROLLING_WINDOW_SCRIPT,
      [key],
      [LIMITS[route], WINDOW_MS, randomUUID()],
    );
    if (
      !Array.isArray(decision) ||
      decision.length !== 2 ||
      ![0, 1].includes(decision[0]) ||
      !Number.isInteger(decision[1]) ||
      decision[1] < 0 ||
      decision[1] > 600 ||
      (decision[0] === 1 && decision[1] !== 0) ||
      (decision[0] === 0 && decision[1] < 1)
    )
      return denied(503, 30);
    return decision[0] === 1 ? null : denied(429, decision[1]);
  } catch {
    // Never log the exception: SDK errors may contain endpoints or credentials.
    return denied(503, 30);
  }
}
