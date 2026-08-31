"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./ui";
import { NetworkIndicator } from "./network-state";
import { useCommandPalette } from "./interactions/provider";
export function Navigation() {
  const path = usePathname();
  const openPalette = useCommandPalette();
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <button
            className="command-launcher"
            onClick={openPalette}
            aria-label="Open command palette"
            aria-keyshortcuts="Meta+K Control+K"
          >
            <span aria-hidden="true">⌘ K</span>
          </button>
          {path === "/" ? (
            <>
              <Link href="/network">Network</Link>
              <Link href="/developers/try">Developers</Link>
              <Link href="/history">Archive</Link>
              <NetworkIndicator />
            </>
          ) : (
            <>
              <Link href="/network" className="nav-how">
                Network
              </Link>
              <Link
                href="/history"
                aria-current={path === "/history" ? "page" : undefined}
              >
                Archive
              </Link>
              <Link
                href="/forge"
                className="nav-cta"
                aria-current={path === "/forge" ? "page" : undefined}
              >
                Forge route <span aria-hidden="true">↗</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
