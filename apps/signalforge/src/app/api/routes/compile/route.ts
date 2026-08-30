import { handleRoutePlan } from "@/server/route-http";
export const runtime = "nodejs";
export const POST = (request: Request) => handleRoutePlan(request, true);
