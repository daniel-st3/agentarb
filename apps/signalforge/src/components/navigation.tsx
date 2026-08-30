"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./ui";
export function Navigation() {
  const path = usePathname();
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/#how-it-works" className="nav-how">
            How it works
          </Link>
          <Link
            href="/history"
            aria-current={path === "/history" ? "page" : undefined}
          >
            History
          </Link>
          <Link
            href="/forge"
            className="nav-cta"
            aria-current={path === "/forge" ? "page" : undefined}
          >
            Forge a brief <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
