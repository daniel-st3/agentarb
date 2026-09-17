import { ZodError, z } from "zod";
import { ForgeUnderwritingInputSchema, ForgeUnderwritingResponseSchema } from "@/domain/forge-underwriting";
import { readBounded } from "@/server/http";
import { checkPlanningLimit, quotaHeaders } from "@/server/planning-limit";
import { persistForgeRun } from "@/server/account/forge-runs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifySaveAuthorization } from "@/server/account/save-proof";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const ClaimSchema = z.object({
  input: ForgeUnderwritingInputSchema,
  result: ForgeUnderwritingResponseSchema,
  saveAuthorization: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function GET() {
  const client = await createSupabaseServerClient();
  if (!client) return Response.json({ error: "Account persistence is unavailable." }, { status: 503, headers: noStore });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return Response.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const { data, error } = await client.from("forge_runs")
    .select("id,title,objective,decision,result_payload,receipt_hash,created_at,updated_at")
    .order("created_at", { ascending: false }).limit(100);
  return error
    ? Response.json({ error: "Saved analyses are temporarily unavailable." }, { status: 503, headers: noStore })
    : Response.json({ runs: data }, { headers: noStore });
}

export async function POST(request: Request) {
  const limited = await checkPlanningLimit(request, "underwriting");
  if (limited) return limited;
  try {
    const body = ClaimSchema.parse(await readBounded(request));
    if (!body.input.clientRunId || body.input.clientRunId !== body.result.clientRunId ||
      !verifySaveAuthorization(body.result.clientRunId, body.result.receipt.receiptHash, body.saveAuthorization)) {
      return Response.json({ error: "The saved analysis could not be verified as a server result." }, { status: 409, headers: { ...noStore, ...quotaHeaders(request) } });
    }
    const persistence = await persistForgeRun(body.input, body.result);
    if (persistence.status === "guest") return Response.json({ error: "Authentication required." }, { status: 401, headers: noStore });
    return Response.json(persistence, { headers: { ...noStore, ...quotaHeaders(request) } });
  } catch (error) {
    const invalid = error instanceof ZodError || error instanceof SyntaxError;
    return Response.json({ error: invalid ? "Invalid saved analysis payload." : "Unable to save this analysis." }, { status: invalid ? 400 : 503, headers: { ...noStore, ...quotaHeaders(request) } });
  }
}
