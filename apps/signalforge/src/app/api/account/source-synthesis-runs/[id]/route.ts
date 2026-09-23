import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid run." }, { status: 400 });
  const client = await createSupabaseServerClient();
  if (!client) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await client.from("source_synthesis_runs").delete().eq("id", id.data).select("id").maybeSingle();
  if (error) return Response.json({ error: "Unable to delete run." }, { status: 503 });
  if (!data) return Response.json({ error: "Run not found." }, { status: 404 });
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
