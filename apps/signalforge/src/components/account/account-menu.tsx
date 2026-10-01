"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import Link from "@/i18n/navigation";
import type { AccountCopy } from "./copy";

export function AccountMenu({
  label,
  copy,
  signOut,
}: {
  label: string;
  copy: AccountCopy;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [openAtPath, setOpenAtPath] = useState<string | null>(null);
  const open = openAtPath === pathname;

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenAtPath(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenAtPath(null);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpenAtPath(null);

  return (
    <div className="account-menu" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
    }} onKeyDown={(event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (!open) { setOpenAtPath(pathname); return; }
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }}>
      <button
        ref={trigger}
        type="button"
        className="account-menu-trigger"
        aria-label={copy.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpenAtPath((value) => value === pathname ? null : pathname)}
      >
        <span>{label}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={menuId} className="account-menu-panel" role="menu" aria-label={copy.menu}>
          <Link role="menuitem" href="/account/history" onClick={close}>{copy.analyses}</Link>
          <Link role="menuitem" href="/account" onClick={close}>{copy.account}</Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              close();
              void signOut();
            }}
          >
            {copy.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
