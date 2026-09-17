import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

function configuredSupabaseOrigin() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co") ? url.origin : null;
  } catch {
    return null;
  }
}

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const supabaseOrigin = configuredSupabaseOrigin();
    const connectSrc = ["'self'", supabaseOrigin].filter(Boolean).join(" ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${connectSrc}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
          },
        ],
      },
    ];
  },
};
export default createNextIntlPlugin()(config);
