import { pageMetadata } from "@/i18n/metadata";
import { RouteArchive } from "@/components/route-views";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "history", "/history");
export default function Page() {
  return <RouteArchive />;
}
