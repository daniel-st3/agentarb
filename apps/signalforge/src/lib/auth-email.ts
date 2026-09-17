import { safeAuthNext } from "./auth-redirect";

export function emailConfirmationRedirect(origin: string, next: string) {
  const redirect = new URL("/auth/confirm", origin);
  redirect.searchParams.set("next", safeAuthNext(next));
  return redirect.toString();
}
