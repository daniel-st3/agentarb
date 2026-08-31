"use client";
import { useCopy } from "@/i18n/copy";

import Link from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { Brand } from "./ui";
import { NetworkIndicator } from "./network-state";
import { useCommandPalette } from "./interactions/provider";
import { LanguageSelector } from "./language-selector";
export function Navigation() {
  const t = useCopy();

  const path = usePathname();
  const openPalette = useCommandPalette();
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Brand />
        <nav aria-label={t("Main navigation")}>
          <button
            className="command-launcher"
            onClick={openPalette}
            aria-label={t("Open command palette")}
            aria-keyshortcuts="Meta+K Control+K"
          >
            <span aria-hidden="true">{t("⌘ K")}</span>
          </button>
          {t(
            path === "/" ? (
              <>
                <Link href="/network">{t("Network")}</Link>
                <Link href="/developers/try">{t("Developers")}</Link>
                <Link href="/history">{t("Archive")}</Link>
                <NetworkIndicator />
              </>
            ) : (
              <>
                <Link href="/network" className="nav-how">
                  {t("Network")}
                </Link>
                <Link
                  href="/history"
                  aria-current={path === "/history" ? "page" : undefined}
                >
                  {t("Archive")}
                </Link>
                <Link
                  href="/forge"
                  className="nav-cta"
                  aria-current={path === "/forge" ? "page" : undefined}
                >
                  {t("Forge route")}
                  <span aria-hidden="true">↗</span>
                </Link>
              </>
            ),
          )}
        </nav>
        <LanguageSelector />
      </div>
    </header>
  );
}
