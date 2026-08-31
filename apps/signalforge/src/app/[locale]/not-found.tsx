import { useCopy } from "@/i18n/copy";
import { ActionLink } from "@/components/ui";
export default function NotFound() {
  const t = useCopy();

  return (
    <div className="empty-state">
      <p className="eyebrow">{t("404 / OFF THE ROUTE")}</p>
      <h1>{t("This page isn’t in the plan.")}</h1>
      <ActionLink href="/forge">{t("Start a research brief")}</ActionLink>
    </div>
  );
}
