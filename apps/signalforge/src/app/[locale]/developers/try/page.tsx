import { pageMetadata } from "@/i18n/metadata";
import { AgentIntegrationProof } from "@/components/agent-integration-proof";
import {ArbitrageApiProof} from "@/components/arbitrage/api-proof";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "try", "/developers/try");
export default function Page() {
  return <><ArbitrageApiProof/><AgentIntegrationProof /></>;
}
