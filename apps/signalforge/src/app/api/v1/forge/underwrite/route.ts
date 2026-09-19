import { handleForgeUnderwriting, handleForgeUnderwritingStream } from "@/server/forge-underwriting";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = (request: Request) =>
  request.headers.get("accept")?.toLowerCase().includes("application/x-ndjson")
    ? handleForgeUnderwritingStream(request)
    : handleForgeUnderwriting(request);
