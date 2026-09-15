import { pageMetadata } from "@/i18n/metadata";
import { getCopy } from "@/i18n/server";
import { BriefView } from "@/components/research-views";
import { seedRuns } from "@/domain/engine";
import { demoDataEnabled } from "@/server/demo-mode";
import { notFound } from "next/navigation";
import {ReportPreview} from "@/components/editorial/narrative";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "output", "/forge/[id]/output");
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getCopy();
  const {id}=await params;
  if (!demoDataEnabled()) notFound();
  const example=id.startsWith("example-")?(await seedRuns()).find(r=>r.request.id===id):undefined;

  return (
    <>
      <div className="container route-boundary">
        {t(
          "SIMULATED EXECUTION OUTPUT · Separate fictional case, not evidence of this route executing.",
        )}
      </div>
      <BriefView id={id} example={example} />
      {example&&<ReportPreview run={example}/>}
    </>
  );
}
