import { pageMetadata } from "@/i18n/metadata";
import { NetworkExplorer } from "@/components/network";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "network", "/network");
export default function Page() {
  return <NetworkExplorer />;
}
