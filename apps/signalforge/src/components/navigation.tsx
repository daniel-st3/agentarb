"use client";
import { useCopy } from "@/i18n/copy";
import Link, { usePathname } from "@/i18n/navigation";
import { Brand } from "./ui";
import { NetworkIndicator } from "./network-state";
import { useCommandPalette } from "./interactions/provider";
import { LanguageSelector } from "./language-selector";
export function Navigation() {
  const t = useCopy(),
    path = usePathname(),
    open = useCommandPalette();
  const links = [
    ["/opportunities", "Radar"],
    ["/network", "Network"],
    ["/forge", "Route Forge"],
    ["/developers/try", "Developers"],
    ["/history", "Archive"],
  ];
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Brand />
        <nav aria-label={t("Main navigation")}>
          <button
            className="command-launcher"
            onClick={open}
            aria-label={t("Open command palette")}
            aria-keyshortcuts="Meta+K Control+K"
          >
            <span aria-hidden="true">⌘ K</span>
          </button>
          <div className="arb-nav-desktop">
            {links.map(([url, label]) => (
              <Link
                key={url}
                href={url}
                aria-current={path === url ? "page" : undefined}
              >
                {t(label)}
              </Link>
            ))}
            <NetworkIndicator />
          </div>
          <details className="arb-mobile-nav">
            <summary>{t("Menu")}</summary>
            <div>
              {links.map(([url, label]) => (
                <Link
                  key={url}
                  href={url}
                  onClick={(e) => {
                    e.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                  aria-current={path === url ? "page" : undefined}
                >
                  {t(label)}
                </Link>
              ))}
            </div>
          </details>
        </nav>
        <LanguageSelector />
      </div>
    </header>
  );
}
