import { pageMetadata } from "@/i18n/metadata";
import { ForgeLab } from "@/components/forge-lab/forge-lab";
import { capabilityIds, ObjectiveInputSchema } from "@/domain/objective";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "forge", "/forge");
export default async function Forge({
  searchParams,
}: {
  searchParams: Promise<{
    capability?: string;
    listing?: string;
    objective?: string;
  }>;
}) {
  const { capability, listing, objective } = await searchParams;
  const forwarded = ObjectiveInputSchema.shape.objective.safeParse(objective);
  const initial = forwarded.success
    ? forwarded.data
    : capabilityIds.includes(capability as never)
      ? `Build a safe service route for ${capability!.replaceAll("_", " ")} with explicit validation and budget constraints.`
      : "";
  const reference =
    listing && /^[a-z0-9-]+:[a-zA-Z0-9_.:%/-]{1,200}$/.test(listing)
      ? listing
      : undefined;
  return (
    <ForgeLab
      key={initial + (reference ?? "")}
      initialObjective={
        initial +
        (reference
          ? ` Consider catalog reference ${reference} as discovery context only; do not execute it.`
          : "")
      }
    />
  );
}
