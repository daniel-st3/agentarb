import { NextResponse } from "next/server";
import { discoverPublic } from "@/lib/discovery";
import { z } from "zod";
import { isSameOrigin } from "@/lib/http-boundary";
import { enforcePublicLimit } from "@/server/public-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await enforcePublicLimit(request, "discovery");
  if (blocked) return blocked;
  const session = z
    .string()
    .uuid()
    .safeParse(request.headers.get("x-sandbox-session"));
  if (
    !session.success ||
    !isSameOrigin(request) ||
    new URL(request.url).search
  ) {
    return NextResponse.json(
      {
        error: "A valid session header and fixed discovery route are required.",
      },
      { status: 400 },
    );
  }
  const { opportunities, statuses } = await discoverPublic();
  return NextResponse.json(
    { opportunities, statuses, external_execution_status: "discovery_only" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
