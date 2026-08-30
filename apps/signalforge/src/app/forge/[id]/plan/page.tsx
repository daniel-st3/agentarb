import { PlanView } from "@/components/research-views";
export const metadata = { title: "Your research route" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanView id={id} />;
}
