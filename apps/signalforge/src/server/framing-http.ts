import "server-only";
import { ObjectiveInputSchema } from "@/domain/objective";
import { checkPlanningLimit } from "./planning-limit";
import { readBounded } from "./http";
import { frameWithProvider } from "./framing-provider";
import {
  DecompositionEventSchema,
  type DecompositionEvent,
} from "@/domain/objective";

export async function handleFrame(request: Request) {
  const limited = await checkPlanningLimit(request);
  if (limited) return limited;
  let input;
  try {
    input = ObjectiveInputSchema.parse(await readBounded(request));
  } catch {
    return Response.json(
      { error: "Check the objective, URL and budget, then try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const body = new ReadableStream<Uint8Array>({
    async start(stream) {
      const emit = (event: DecompositionEvent) => {
        if (!signal.aborted)
          stream.enqueue(
            new TextEncoder().encode(
              JSON.stringify(DecompositionEventSchema.parse(event)) + "\n",
            ),
          );
      };
      try {
        emit({ type: "status", message: "Parsing objective…" });
        const result = await frameWithProvider(input, emit, signal);
        emit({ type: "result", result });
        if (!signal.aborted) stream.close();
      } catch {
        if (!signal.aborted)
          stream.error(new Error("Decomposition interrupted."));
      }
    },
    cancel() {
      controller.abort();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
