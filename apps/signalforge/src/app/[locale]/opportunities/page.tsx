import { ArbitrageWorkbench } from "@/components/arbitrage/workbench";
import { cachedNetworkView } from "@/server/intelligence/cached-view";
import { pageMetadata } from "@/i18n/metadata";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => pageMetadata(params, "opportunities", "/opportunities");
export default async function Opportunities({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams,
    network = await cachedNetworkView();
  return (
    <ArbitrageWorkbench
      network={network ?? { records: [] }}
      initialMode={query.mode === "observed" ? "observed" : "lab"}
      selectedId={typeof query.id === "string" ? query.id : undefined}
    />
  );
}
