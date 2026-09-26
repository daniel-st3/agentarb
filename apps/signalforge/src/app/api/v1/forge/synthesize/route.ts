import { handleSourceSynthesis } from "@/server/source-synthesis/service";

export const runtime = "nodejs";
export const maxDuration = 45;
export const POST = handleSourceSynthesis;
