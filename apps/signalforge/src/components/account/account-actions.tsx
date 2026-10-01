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

export function DeleteAnalysis({ id, label, prompt, detail, kind = "forge-runs" }: { id: string; label: string; prompt: string; detail: string; kind?: "forge-runs" | "source-synthesis-runs" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const locale = useLocale();
  async function remove() {
    if (!confirm(`${prompt}\n\n${detail}`)) return;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/account/${kind}/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      router.push("/account/history");
      router.refresh();
    } catch { setFailed(true); setPending(false); }
  }
  return <div><button className="account-danger" type="button" onClick={remove} disabled={pending}>{label}</button>{failed && <p role="alert">{locale === "es" ? "No se pudo eliminar. Inténtalo de nuevo." : locale === "fr" ? "La suppression a échoué. Réessayez." : "Deletion failed. Please try again."}</p>}</div>;
}

export function DownloadSavedReceipt({ receipt }: { receipt: unknown }) {
  const locale = useLocale();
  return <button type="button" className="account-primary" onClick={() => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "valrun-saved-receipt.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}>{locale === "es" ? "Descargar recibo" : locale === "fr" ? "Télécharger le reçu" : "Download receipt"}</button>;
}
