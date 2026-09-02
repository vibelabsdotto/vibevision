import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";

import { ThemeScript, ThemeToggle } from "@/app/components/theme-toggle";
import { getAuth } from "@/app/lib/auth";
import "@/app/globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap"
});

export const metadata: Metadata = {
  title: "VibeVision",
  description: "The open 12 Week Year execution operating system — by VibeLabs.",
  applicationName: "VibeVision"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0C0E" }
  ]
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/today", label: "Today" },
  { href: "/cycles", label: "Cycles" }
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans`}>
        <ThemeScript />
        <div className="min-h-dvh pb-24 md:pb-8">
          <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
              <Link className="flex items-center gap-2 py-3" href="/">
                <span className="brand-gradient-text font-display text-lg font-bold tracking-tight">VibeVision</span>
              </Link>
              <div className="flex items-center gap-2">
                {auth ? (
                  <form action="/logout" method="post">
                    <button
                      className="rounded-[12px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-coral hover:text-coral"
                      type="submit"
                    >
                      Sign out
                    </button>
                  </form>
                ) : (
                  <Link className="rounded-[12px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-teal hover:text-teal" href="/login">
                    Sign in
                  </Link>
                )}
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

          {/* mobile bottom nav */}
          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            aria-label="Primary"
          >
            <div className="mx-auto grid max-w-md grid-cols-3">
              {NAV.map((item) => (
                <Link
                  className="px-2 py-3 text-center text-sm font-medium text-ink-2 transition active:text-coral"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </body>
    </html>
  );
}