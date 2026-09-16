import { handleForgeUnderwriting } from "@/server/forge-underwriting";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = (request: Request) => handleForgeUnderwriting(request);
