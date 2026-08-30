import { handleCatalog } from "@/server/intelligence/http";
export const runtime = "nodejs";
export const maxDuration = 20;
export const POST = (request: Request) => handleCatalog(request, "evaluate");
