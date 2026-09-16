import { getLocale } from "next-intl/server";
import { ProfitEngine } from "@/components/profit-engine/profit-engine";
import { normalizeRealLabData } from "@/components/v2-lab/lab-model";
import { safeLocale } from "@/i18n/routing";
import { cachedNetworkView } from "@/server/intelligence/cached-view";

export async function LiveHome() {
  const [locale, network] = await Promise.all([
    getLocale(),
    cachedNetworkView(),
  ]);
  const records = network?.records ?? [];
  const opportunities = records.filter((record) => record.listingType === "task_opportunity");
  const services = records.filter((record) => record.listingType === "service_offer");
  const initialDataset = normalizeRealLabData(
    {
      records: opportunities.slice(0, 20),
      matchedCount: opportunities.length,
      truncated: opportunities.length > 20,
      executionStatus: "execution_not_enabled",
    },
    {
      records: services.slice(0, 50),
      executionStatus: "execution_not_enabled",
    },
  );

  return <ProfitEngine locale={safeLocale(locale)} initialDataset={initialDataset} />;
}
