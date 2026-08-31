"use client";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { locales } from "@/i18n/routing";
export function LanguageSelector() {
  const locale = useLocale(),
    path = usePathname(),
    router = useRouter();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <nav
      className="locale-selector"
      aria-label={
        locale === "es" ? "Idioma" : locale === "fr" ? "Langue" : "Language"
      }
    >
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-label={
            code === "es" ? "Español" : code === "fr" ? "Français" : "English"
          }
          aria-current={locale === code ? "true" : undefined}
          onClick={() =>
            router.replace(
              path + window.location.search + window.location.hash,
              { locale: code, scroll: false },
            )
          }
        >
          {code.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}
