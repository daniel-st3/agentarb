import { pageMetadata } from "@/i18n/metadata";
import { NetworkExplorer } from "@/components/network";
import { cachedNetworkView } from "@/server/intelligence/cached-view";
import Link from "@/i18n/navigation";
import { getCopy } from "@/i18n/server";
import {CatalogQuerySchema,matchListing,compareListings} from "@/domain/intelligence";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string; id?: string }>;
}) => pageMetadata(params, "network", "/network");
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const cached = await cachedNetworkView(),
    t = await getCopy();
  const parsed=CatalogQuerySchema.safeParse(await searchParams);
  const query=parsed.success?parsed.data:CatalogQuerySchema.parse({});
  const initial=cached?{...cached,records:cached.records.filter(l=>matchListing(l,query)).sort((a,b)=>compareListings(a,b,query)).slice(0,query.limit)}:undefined;
  const filters=Object.fromEntries(Object.entries(query).filter(([k])=>k!=="limit").map(([k,v])=>[k,String(v)]));
  return (
    <>
      <nav
        className="container arb-source-tabs"
        aria-label={t("Demand and supply")}
      >
        <Link href="/opportunities?mode=observed">{t("Opportunities")}</Link>
        <Link href="/network" aria-current="page">
          {t("Services")}
        </Link>
      </nav>
      <NetworkExplorer initial={initial} initialFilters={filters} />
    </>
  );
}
