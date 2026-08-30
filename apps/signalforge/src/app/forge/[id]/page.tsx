import { ExecutionRouteView } from "@/components/route-views";
export const metadata = { title: "Execution route" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExecutionRouteView id={id} />;
}
