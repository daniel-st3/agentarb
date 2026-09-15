import { pageMetadata } from "@/i18n/metadata";
import { AgentIntegrationProof } from "@/components/agent-integration-proof";
import {ArbitrageApiProof} from "@/components/arbitrage/api-proof";
import {demoDataEnabled} from "@/server/demo-mode";
import {cachedNetworkView} from "@/server/intelligence/cached-view";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "try", "/developers/try");
export default async function Page() {
  const network=await cachedNetworkView();
  return <><ArbitrageApiProof initialId={demoDataEnabled()?"lab:spread":network?.records.find(r=>r.listingType==="task_opportunity")?.id}/><AgentIntegrationProof /></>;
}
