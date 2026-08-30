import { RouteCompetition } from "@/components/route-views";
export const metadata = { title: "Capability route" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RouteCompetition id={id} />;
}
