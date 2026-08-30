import { handleRun } from "@/server/http";
import { checkPlanningLimit } from "@/server/planning-limit";
export async function POST(request: Request) {
  return (await checkPlanningLimit(request)) ?? handleRun(request);
}
export const runtime = "nodejs";
