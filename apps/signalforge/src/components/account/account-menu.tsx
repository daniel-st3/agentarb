"use client";

import { useEffect, useRef, useState } from "react";
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
  const [openAtPath, setOpenAtPath] = useState<string | null>(null);
  const open = openAtPath === pathname;

  useEffect(() => {
    if (!open) return;
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
    <div className="account-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="account-menu-trigger"
        aria-label={copy.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenAtPath((value) => value === pathname ? null : pathname)}
      >
        <span>{label}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="account-menu-panel" role="menu" aria-label={copy.menu}>
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
