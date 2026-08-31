import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { ResearchSession } from "@/components/session";
import { seedRuns } from "@/domain/engine";
import "./globals.css";
import "./polish.css";
import "./command.css";
import "./network.css";
import "./command-canvas.css";
import "./interactions.css";
import "./locales.css";
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
/** Shared root preserves tab-only routes when the locale segment changes. */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale(),
    seeds = await seedRuns();
  return (
    <html
      lang={locale}
      className={`${geist.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <ResearchSession seeds={seeds}>{children}</ResearchSession>
      </body>
    </html>
  );
}
