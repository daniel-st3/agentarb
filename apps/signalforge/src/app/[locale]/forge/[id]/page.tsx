import { pageMetadata } from "@/i18n/metadata";
import { ExecutionRouteView } from "@/components/route-views";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "route", "/forge/[id]");
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExecutionRouteView id={id} />;
}
