import { BriefView } from "@/components/research-views";
export const metadata = { title: "Simulated research output" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <div className="container route-boundary">
        SIMULATED EXECUTION OUTPUT · Separate fictional case, not evidence of
        this route executing.
      </div>
      <BriefView id={(await params).id} />
    </>
  );
}
