# Accounts and Saved Runs

Accounts add private continuity; they do not gate SignalForge or grant execution permission. Forge, Radar, Network, developer surfaces, complete underwriting results, and receipt downloads remain public.

## Supabase setup

Apply `supabase/migrations/20260917023313_accounts_saved_runs_v1.sql` to the intended Supabase project. The migration creates `profiles` and `forge_runs`, enables row-level security, and limits every user-owned operation to `auth.uid()`.

Configure these Vercel variables for Preview before verification:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

These are Supabase public project identifiers. Never add a service-role key to the browser or to a `NEXT_PUBLIC_` variable.

In Supabase Auth URL configuration, allow the immutable/current Preview origin plus:

```text
/auth/callback
/auth/confirm
```

For passwordless email in this SSR application, the **Magic Link** template must use the token hash and the request's allowlisted Preview redirect. Set the link target exactly to:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Log In</a>
```

`signInWithOtp` supplies an allowlisted `https://<current-origin>/auth/confirm?next=...` value as `RedirectTo`. The confirmation route verifies the one-time token server-side and writes the authenticated session cookies. Do not use `SiteURL` here: it would send Preview sign-ins to Production. Do not use the default `ConfirmationURL` for this SSR flow: it converts the email token into a PKCE code that depends on a verifier cookie from the browser that initiated the request. Keep responses generic to avoid account enumeration.

Google requires a Google OAuth client configured in the Supabase dashboard. Add only the callback URL displayed by Supabase; do not put the Google client secret in Vercel or this repository.

## Persistence model

Signed-in Forge requests are saved after the server-authoritative result is produced. Guest results remain in browser session storage only after the visitor explicitly chooses **Save this analysis**. A domain-separated HMAC attests the exact run ID and receipt fingerprint before post-auth persistence; the proof is never stored in `forge_runs`.

Database failure never invalidates underwriting. History records are immutable economic snapshots unless the user renames or deletes their own row. Opening history never re-runs the analysis.
