import { pageMetadata } from "@/i18n/metadata";
import { RouteCompetition } from "@/components/route-views";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "plan", "/forge/[id]/plan");
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RouteCompetition id={id} />;
}
