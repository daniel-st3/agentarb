"use client";
import { useCopy } from "@/i18n/copy";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useCopy();

  return (
    <div className="empty-state">
      <h1>{t("Something interrupted this view.")}</h1>
      <p>
        {t("No external services were called. Try loading the view again.")}
      </p>
      <button className="button" onClick={reset}>
        {t("Try again")}
      </button>
    </div>
  );
}
