import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";

import { AppSidebar } from "@/app/components/app-sidebar";
import { ThemeScript, ThemeToggle } from "@/app/components/theme-toggle";
import { getAuth } from "@/app/lib/auth";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger
} from "@/lib/ui/sidebar";
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
  { href: "/weeks", label: "Weeks" },
  { href: "/cycles", label: "Cycles" }
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans`}>
        <ThemeScript />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="flex min-h-svh flex-col">
            <div className="flex flex-1 flex-col">
              {/* top bar — actions only; navigation lives in the sidebar (desktop) / bottom nav (mobile) */}
              <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
                <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
                  <div className="flex items-center gap-3">
                    <SidebarTrigger className="hidden md:inline-flex" />
                    <span className="text-sm font-medium text-ink-2 md:hidden">VibeVision</span>
                  </div>
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
                      <Link
                        className="rounded-[12px] border border-border px-3 py-1.5 text-sm text-ink-2 transition hover:border-teal hover:text-teal"
                        href="/login"
                      >
                        Sign in
                      </Link>
                    )}
                    <ThemeToggle />
                  </div>
                </div>
              </header>

              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 sm:py-8 md:pb-8">{children}</main>
            </div>
          </SidebarInset>

          {/* mobile bottom nav — the desktop sidebar replaces it */}
          <nav
            aria-label="Primary"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          >
            <div className="mx-auto grid max-w-md grid-cols-4">
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
        </SidebarProvider>
      </body>
    </html>
  );
}
