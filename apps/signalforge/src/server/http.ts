import { z } from "zod";
import { requestInputSchema, ResearchRequestSchema } from "@/domain/schema";
import { createPlan, executeRun } from "@/domain/engine";
import { demoDataEnabled } from "./demo-mode";

const runInput = z
  .object({ request: ResearchRequestSchema, consent: z.literal(true) })
  .strict();
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function readBounded(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new Error("invalid");
  const origin = request.headers.get("origin");
  // Next's standalone server can normalize request.url to localhost even when
  // the browser uses 127.0.0.1. Compare against the actual HTTP Host, not a
  // forwarded host supplied by a client. No upstream request is ever made.
  if (origin) {
    const source = new URL(origin);
    const target = new URL(request.url);
    const host = request.headers.get("host") ?? target.host;
    if (
      !["http:", "https:"].includes(source.protocol) ||
      source.host !== host ||
      source.username ||
      source.password ||
      source.origin !== origin
    )
      throw new Error("invalid");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid");
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel("request_timeout");
  }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error("request_timeout");
      if (done) break;
      total += value.byteLength;
      if (total > 16_384) throw new Error("body_too_large");
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function handlePlan(request: Request) {
  if (!demoDataEnabled())
    return Response.json(
      { error: "Example simulation is unavailable." },
      { status: 404, headers },
    );
  try {
    const input = requestInputSchema.parse(await readBounded(request));
    return Response.json(await createPlan(input, crypto.randomUUID()), {
      headers,
    });
  } catch {
    return Response.json(
      {
        error:
          "We couldn't plan this request. Use a question of 12–2,000 characters, a valid HTTPS URL, and a budget from $0 to $10.",
      },
      { status: 400, headers },
    );
  }
}
export async function handleRun(request: Request) {
  if (!demoDataEnabled())
    return Response.json(
      { error: "Example simulation is unavailable." },
      { status: 404, headers },
    );
  try {
    const input = runInput.parse(await readBounded(request));
    return Response.json(await executeRun(input.request, input.consent), {
      headers,
    });
  } catch {
    return Response.json(
      {
        error:
          "This demo route could not run. Return to the composer and create a new plan.",
      },
      { status: 400, headers },
    );
  }
}
