import { pageMetadata } from "@/i18n/metadata";
import { getCopy } from "@/i18n/server";
import { BriefView } from "@/components/research-views";
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

  return (
    <>
      <div className="container route-boundary">
        {t(
          "SIMULATED EXECUTION OUTPUT · Separate fictional case, not evidence of this route executing.",
        )}
      </div>
      <BriefView id={(await params).id} />
    </>
  );
}
