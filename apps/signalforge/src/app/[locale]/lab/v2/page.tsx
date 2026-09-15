import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { VisualLab } from "@/components/v2-lab/visual-lab";
import { locales, safeLocale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = safeLocale((await params).locale);
  const titles = {
    en: "V2 visual laboratory",
    es: "Laboratorio visual V2",
    fr: "Laboratoire visuel V2",
  };
  return {
    title: `${titles[locale]} · SignalForge`,
    description: "An isolated SignalForge interaction study. Not production UI.",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function V2LabPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!hasLocale(locales, rawLocale)) notFound();
  const locale = safeLocale(rawLocale);
  setRequestLocale(locale);
  return <VisualLab locale={locale} />;
}
