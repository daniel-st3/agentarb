import { NextResponse } from "next/server";
import { policyEnvelopeSchema } from "@/lib/contracts";
import { discoverPublic } from "@/lib/discovery";
import { evaluateOpportunity } from "@/lib/policy";
import { checkRefreshCooldown } from "@/lib/rate-limit";
import { isSameOrigin, readLimitedJson } from "@/lib/http-boundary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request) || new URL(request.url).search) {
    return NextResponse.json(
      {
        error:
          "Only same-origin evaluation without query parameters is supported.",
      },
      { status: 400 },
    );
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json(
      { error: "Expected a JSON policy envelope." },
      { status: 415 },
    );
  }
  let unknownInput: unknown;
  try {
    unknownInput = await readLimitedJson(request);
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }
  const parsed = policyEnvelopeSchema.safeParse(unknownInput);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Policy input failed closed.",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }
  const cooldown = checkRefreshCooldown(parsed.data.sessionId);
  if (!cooldown.allowed) {
    return NextResponse.json(
      {
        error: "Public listings were refreshed recently.",
        retryAfterSeconds: cooldown.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(cooldown.retryAfterSeconds) },
      },
    );
  }
  const { opportunities, statuses } = await discoverPublic();
  const results = opportunities.map((opportunity) =>
    evaluateOpportunity(opportunity, parsed.data),
  );
  return NextResponse.json(
    {
      evaluatedAt: new Date().toISOString(),
      statuses,
      results,
      boundary: {
        sessionOnly: true,
        persistence: "none",
        marketplaceActions: "disabled",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      },
    },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Use the validated session evaluation endpoint." },
    { status: 405 },
  );
}
