"use client";

import {
  Calendar,
  CalendarDays,
  ChevronsUpDown,
  ExternalLink,
  LayoutDashboard,
  ListChecks,
  LogIn,
  LogOut,
  NotebookPen,
  PanelLeft,
  PanelLeftClose,
  Repeat
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/app/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@/lib/ui/sidebar";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/today", label: "Today", icon: ListChecks },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/daily-logs", label: "Daily Logs", icon: NotebookPen },
  { href: "/weeks", label: "Weeks", icon: CalendarDays },
  { href: "/cycles", label: "Cycles", icon: Repeat }
];

type SidebarUser = { email: string } | null;

export function AppSidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const { state, toggleSidebar } = useSidebar();
  const email = user?.email ?? "";
  const displayName = email ? email.split("@")[0] : "VibeVision";
  const initials = email ? email.slice(0, 2).toUpperCase() : "VV";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <Sidebar className="border-r border-sidebar-border" collapsible="icon">
      <SidebarHeader>
        {state === "expanded" ? (
          <div className="flex items-center justify-between px-2 py-3">
            <SidebarMenuButton asChild size="lg" tooltip="VibeVision">
              <Link href="/" prefetch={false}>
                <span className="brand-gradient flex size-10 shrink-0 items-center justify-center rounded-[10px] font-display text-sm font-bold text-white shadow-sm">
                  VV
                </span>
                <span className="brand-gradient-text font-display text-lg font-bold tracking-tight">VibeVision</span>
              </Link>
            </SidebarMenuButton>
            <div className="flex items-center gap-1">
              <ThemeToggle className="rounded-md border-0" />
              <button
                aria-label="Collapse sidebar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={toggleSidebar}
                type="button"
              >
                <PanelLeftClose aria-hidden size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-3">
            <button
              aria-label="Expand sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={toggleSidebar}
              type="button"
            >
              <PanelLeft aria-hidden size={16} />
            </button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                    <Link href={item.href} prefetch={false}>
                      <item.icon aria-hidden className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            {user ? (
              <details className="group/account relative">
                <SidebarMenuButton
                  asChild
                  className="group-open/account:bg-sidebar-accent group-open/account:text-sidebar-accent-foreground"
                  size="lg"
                  tooltip={email}
                >
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white">
                      {initials}
                    </span>
                    <span className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold capitalize">{displayName}</span>
                      <span className="truncate text-xs text-ink-3">{email}</span>
                    </span>
                    <ChevronsUpDown aria-hidden className="ml-auto size-4" />
                  </summary>
                </SidebarMenuButton>
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 min-w-56 rounded-[12px] border border-border bg-surface p-1.5 text-sm text-ink shadow-xl">
                  <div className="flex items-center gap-2 p-2">
                    <span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white">
                      {initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium capitalize">{displayName}</span>
                      <span className="block truncate text-xs text-ink-3">{email}</span>
                    </span>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <Link
                    className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 transition hover:bg-surface-2"
                    href="https://vibelabs.to"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden size={16} />
                    VibeLabs
                  </Link>
                  <div className="my-1 h-px bg-border" />
                  <form action="/logout" method="post">
                    <button
                      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left transition hover:bg-error/10 hover:text-error"
                      type="submit"
                    >
                      <LogOut aria-hidden size={16} />
                      Sign out
                    </button>
                  </form>
                </div>
              </details>
            ) : (
              <SidebarMenuButton asChild size="lg" tooltip="Sign in">
                <Link href="/login" prefetch={false}>
                  <span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white">
                    <LogIn aria-hidden size={16} />
                  </span>
                  <span className="font-medium">Sign in</span>
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
