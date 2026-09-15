import { RouteNarrative } from "@/components/editorial/narrative";
import { demoDataEnabled } from "@/server/demo-mode";
import { getCopy } from "@/i18n/server";
export default async function HowItWorks(){const t=await getCopy();return <article className="container real-market"><h1>{t("Find. Price. Decide.")}</h1><p>{t("Observe paid work and its funding constraints.")}</p><p>{t("Separate published prices, bounded estimates and missing costs.")}</p><p>{t("Inspect the policy decision and auditable contract.")}</p><p>{t("No claim, submission, payment or execution is authorized.")}</p>{demoDataEnabled()&&<RouteNarrative/>}</article>}
