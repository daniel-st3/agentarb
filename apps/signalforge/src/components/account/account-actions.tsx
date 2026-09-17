"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "./auth-provider";
import { accountCopy, type AccountLocale } from "./copy";

export function SignInPrompt() {
  const locale = useLocale() as AccountLocale;
  const copy = accountCopy[locale] ?? accountCopy.en;
  const { openAuth } = useAuth();
  return <button className="account-primary" type="button" onClick={openAuth}>{copy.signIn}</button>;
}

export function DeleteAnalysis({ id, label, prompt, detail }: { id: string; label: string; prompt: string; detail: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function remove() {
    if (!confirm(`${prompt}\n\n${detail}`)) return;
    setPending(true);
    const response = await fetch(`/api/account/forge-runs/${id}`, { method: "DELETE" });
    if (response.ok) router.push("/account/history");
    else setPending(false);
  }
  return <button className="account-danger" type="button" onClick={remove} disabled={pending}>{label}</button>;
}

