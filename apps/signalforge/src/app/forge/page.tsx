import { ResearchCommand } from "@/components/research-command";
import { capabilityIds } from "@/domain/objective";
export const metadata = { title: "Agent objective console" };
export default async function Forge({
  searchParams,
}: {
  searchParams: Promise<{ capability?: string; listing?: string }>;
}) {
  const { capability, listing } = await searchParams;
  const initial = capabilityIds.includes(capability as never)
    ? `Build a safe service route for ${capability!.replaceAll("_", " ")} with explicit validation and budget constraints.`
    : "";
  const reference =
    listing && /^[a-z0-9-]+:[a-zA-Z0-9_.:%/-]{1,200}$/.test(listing)
      ? listing
      : undefined;
  return (
    <ResearchCommand
      initialObjective={
        initial +
        (reference
          ? ` Consider catalog reference ${reference} as discovery context only; do not execute it.`
          : "")
      }
    />
  );
}
