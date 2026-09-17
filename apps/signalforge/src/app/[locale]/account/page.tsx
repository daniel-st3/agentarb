import { getAuthenticatedUser } from "@/lib/supabase/server";
import { safeLocale } from "@/i18n/routing";
import { SignInPrompt } from "@/components/account/account-actions";
export const metadata = { robots: { index: false, follow: false } };

const text = {
  en: { eyebrow: "SIGNALFORGE / ACCOUNT", title: "Account", intro: "Identity provides private persistence and history. It never grants execution authority.", name: "Display name", email: "Email", provider: "Sign-in provider", created: "Account created", deleteNote: "Secure account deletion requires a dedicated re-authenticated server workflow and is not enabled in v1. Saved analyses can be deleted individually." },
  es: { eyebrow: "SIGNALFORGE / CUENTA", title: "Cuenta", intro: "La identidad permite persistencia privada e historial. Nunca concede autoridad de ejecución.", name: "Nombre", email: "Correo", provider: "Proveedor de acceso", created: "Cuenta creada", deleteNote: "La eliminación segura de la cuenta requiere un flujo de servidor con reautenticación y no está habilitada en v1. Los análisis guardados se pueden eliminar individualmente." },
  fr: { eyebrow: "SIGNALFORGE / COMPTE", title: "Compte", intro: "L’identité fournit persistance privée et historique. Elle n’accorde jamais d’autorité d’exécution.", name: "Nom", email: "E-mail", provider: "Fournisseur de connexion", created: "Compte créé", deleteNote: "La suppression sécurisée du compte exige un flux serveur avec réauthentification et n’est pas activée en v1. Les analyses peuvent être supprimées individuellement." },
};

export default async function Account({ params }: { params: Promise<{ locale: string }> }) {
  const locale = safeLocale((await params).locale), t = text[locale];
  const user = await getAuthenticatedUser();
  if (!user) return <article className="account-page container"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p><SignInPrompt /></article>;
  const provider = user.app_metadata?.provider;
  return <article className="account-page container"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p><dl><div><dt>{t.name}</dt><dd>{typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "—"}</dd></div><div><dt>{t.email}</dt><dd>{user.email ?? "—"}</dd></div><div><dt>{t.provider}</dt><dd>{typeof provider === "string" ? provider : "—"}</dd></div><div><dt>{t.created}</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(user.created_at))}</dd></div></dl><p className="account-note">{t.deleteNote}</p></article>;
}
