import { handleRoutePlan } from "@/server/route-http";
export const runtime = "nodejs";
export const maxDuration = 30;
export const POST = (request: Request) => handleRoutePlan(request);
