import { handleCatalog } from "@/server/intelligence/http";
export const runtime = "nodejs";
export const maxDuration = 20;
export const GET = (request: Request) => handleCatalog(request, "status");
