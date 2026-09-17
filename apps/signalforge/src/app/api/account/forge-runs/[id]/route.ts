import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const IdSchema = z.string().uuid();
const RenameSchema = z.object({ title: z.string().trim().min(1).max(200) }).strict();
const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

async function clientAndId(params: Promise<{ id: string }>) {
  const id = IdSchema.safeParse((await params).id);
  const client = await createSupabaseServerClient();
  if (!id.success || !client) return null;
  const { data } = await client.auth.getUser();
  return data.user ? { client, id: id.data } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await clientAndId(params);
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const { data, error } = await context.client.from("forge_runs").select("*").eq("id", context.id).maybeSingle();
  if (error) return Response.json({ error: "Saved analysis is temporarily unavailable." }, { status: 503, headers: noStore });
  if (!data) return Response.json({ error: "Saved analysis not found." }, { status: 404, headers: noStore });
  return Response.json({ run: data }, { headers: noStore });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await clientAndId(params);
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  let body: z.infer<typeof RenameSchema>;
  try { body = RenameSchema.parse(await request.json()); } catch { return Response.json({ error: "Invalid title." }, { status: 400, headers: noStore }); }
  const { data, error } = await context.client.from("forge_runs").update({ title: body.title }).eq("id", context.id).select("id,title").maybeSingle();
  if (error) return Response.json({ error: "Unable to rename analysis." }, { status: 503, headers: noStore });
  if (!data) return Response.json({ error: "Saved analysis not found." }, { status: 404, headers: noStore });
  return Response.json({ run: data }, { headers: noStore });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await clientAndId(params);
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const { data, error } = await context.client.from("forge_runs").delete().eq("id", context.id).select("id").maybeSingle();
  if (error) return Response.json({ error: "Unable to delete analysis." }, { status: 503, headers: noStore });
  if (!data) return Response.json({ error: "Saved analysis not found." }, { status: 404, headers: noStore });
  return Response.json({ deleted: true }, { headers: noStore });
}
