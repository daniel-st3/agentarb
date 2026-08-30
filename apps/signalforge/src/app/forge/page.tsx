import { ResearchCommand } from "@/components/research-command";
import { capabilityIds } from "@/domain/objective";
export const metadata = { title: "Agent objective console" };
export default async function Forge({
  searchParams,
}: {
  searchParams: Promise<{ capability?: string }>;
}) {
  const { capability } = await searchParams;
  const initial = capabilityIds.includes(capability as never)
    ? `Build a safe service route for ${capability!.replaceAll("_", " ")} with explicit validation and budget constraints.`
    : "";
  return <ResearchCommand initialObjective={initial} />;
}
