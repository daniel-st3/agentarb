"use client";
import { useCopy } from "@/i18n/copy";
import Link, { usePathname } from "@/i18n/navigation";
import { Brand } from "./ui";
import { NetworkIndicator } from "./network-state";
import { useCommandPalette } from "./interactions/provider";
import { LanguageSelector } from "./language-selector";
import { useLocale } from "next-intl";
import { useAuth } from "./account/auth-provider";
import { accountCopy, type AccountLocale } from "./account/copy";
export function Navigation() {
  const t = useCopy(),
    path = usePathname(),
    open = useCommandPalette();
  const locale = useLocale() as AccountLocale;
  const account = accountCopy[locale] ?? accountCopy.en;
  const auth = useAuth();
  const links = path === "/"
    ? [
        ["/opportunities", "Market"],
        ["/forge", "Forge"],
        ["/developers/try", "Developers"],
      ]
    : [
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
            {auth.user ? (
              <details className="account-menu">
                <summary aria-label={account.menu}>{auth.user.displayName?.split(" ")[0] ?? auth.user.email?.split("@")[0] ?? account.account}</summary>
                <div>
                  <Link href="/account/history">{account.analyses}</Link>
                  <Link href="/account">{account.account}</Link>
                  <button type="button" onClick={() => auth.signOut()}>{account.signOut}</button>
                </div>
              </details>
            ) : <button className="nav-sign-in" type="button" onClick={auth.openAuth}>{account.signIn}</button>}
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
              {auth.user ? (
                <>
                  <Link href="/account/history">{account.analyses}</Link>
                  <Link href="/account">{account.account}</Link>
                  <button type="button" onClick={() => auth.signOut()}>{account.signOut}</button>
                </>
              ) : <button type="button" onClick={auth.openAuth}>{account.signIn}</button>}
            </div>
          </details>
        </nav>
        <LanguageSelector />
      </div>
    </header>
  );
}
