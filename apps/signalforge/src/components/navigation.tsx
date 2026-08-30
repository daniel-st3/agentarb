"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./ui";
import { NetworkIndicator } from "./network-state";
export function Navigation() {
  const path = usePathname();
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Brand />
        <nav aria-label="Main navigation">
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
