import { BriefView } from "@/components/research-views";
export const metadata = { title: "Research brief" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BriefView id={id} />;
}
