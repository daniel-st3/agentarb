import { handleCatalog } from "@/server/intelligence/http";
export const runtime = "nodejs";
export const maxDuration = 20;
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleCatalog(request, "listing", (await params).id);
}
