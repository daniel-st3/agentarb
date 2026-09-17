"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { accountCopy, type AccountLocale } from "./copy";

export type AuthUser = { id: string; email: string | null; displayName: string | null; avatarUrl: string | null };
type AuthContextValue = {
  configured: boolean;
  user: AuthUser | null;
  openAuth: () => void;
  closeAuth: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, initialUser, configured }: { children: ReactNode; initialUser: AuthUser | null; configured: boolean }) {
  const locale = useLocale() as AccountLocale;
  const copy = accountCopy[locale] ?? accountCopy.en;
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const dialog = useRef<HTMLDialogElement>(null);

  const closeAuth = useCallback(() => {
    dialog.current?.close();
    setOpen(false);
  }, []);
  const openAuth = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
  }, [open]);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user;
      setUser(next ? {
        id: next.id,
        email: next.email ?? null,
        displayName: typeof next.user_metadata?.full_name === "string" ? next.user_metadata.full_name : null,
        avatarUrl: typeof next.user_metadata?.avatar_url === "string" ? next.user_metadata.avatar_url : null,
      } : null);
      router.refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  async function google() {
    const client = createSupabaseBrowserClient();
    if (!client) return setStatus("error");
    setStatus("pending");
    const next = `/${locale}${pathname}`;
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setStatus("error");
  }

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    const client = createSupabaseBrowserClient();
    if (!client || !/^\S+@\S+\.\S+$/.test(email)) return setStatus("error");
    setStatus("pending");
    const next = `/${locale}${pathname}`;
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setStatus(error ? "error" : "sent");
  }

  const value = useMemo<AuthContextValue>(() => ({
    configured,
    user,
    openAuth,
    closeAuth,
    async signOut() {
      const client = createSupabaseBrowserClient();
      if (client) await client.auth.signOut();
      setUser(null);
      router.refresh();
    },
  }), [configured, user, openAuth, closeAuth, router]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {open && (
        <dialog ref={dialog} className="auth-dialog" onClose={() => setOpen(false)} aria-labelledby="auth-title">
          <button className="auth-close" type="button" onClick={closeAuth} aria-label={copy.close}>×</button>
          <p className="auth-kicker">SIGNALFORGE / ACCOUNT</p>
          <h2 id="auth-title">{copy.title}</h2>
          <p>{copy.intro}</p>
          {!configured ? <p role="status" className="auth-status">{copy.unavailable}</p> : (
            <>
              <button className="auth-google" type="button" onClick={google} disabled={status === "pending"}>{copy.google}</button>
              <div className="auth-or"><span>{copy.or}</span></div>
              <form onSubmit={sendEmail}>
                <label htmlFor="auth-email">{copy.email}</label>
                <input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={copy.emailPlaceholder} />
                <button type="submit" disabled={status === "pending"}>{copy.send}</button>
              </form>
              <p className="auth-status" role="status" aria-live="polite">{status === "sent" ? copy.sent : status === "error" ? copy.safeError : ""}</p>
            </>
          )}
          <button className="auth-guest" type="button" onClick={closeAuth}>{copy.continueGuest}</button>
        </dialog>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
