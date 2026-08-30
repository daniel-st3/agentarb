import { agentCard } from "@/domain/discovery-card";
export function GET() {
  return Response.json(agentCard, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
