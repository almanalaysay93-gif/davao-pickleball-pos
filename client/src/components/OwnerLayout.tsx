import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { OwnerNotificationsBell } from "@/components/OwnerFeatureSections";
import { CalendarDays, KeyRound, LayoutDashboard, Lock, Menu, ScrollText, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";

const ownerNavLinks = [
  { href: "/owner-app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/owner-app/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/owner-app/announcements", label: "Announcements", icon: ScrollText },
];

/**
 * Owner-facing app shell. Business management only — no customer booking
 * navigation or references to customer pages.
 */
export default function OwnerLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const ownerLogout = trpc.auth.ownerLogout.useMutation();

  // The fixed-password owner session carries role "owner"; system-admin
  // duties (venue owners panel) are also exposed through this session.
  const isOwner = user?.type === "owner" || user?.role === "owner";
  // Global owner = owns every venue; venue-specific owners carry a venueId
  // in their session and are hidden from the system-wide admin console.
  const isGlobalOwner =
    isOwner && (user as { venueId?: number | null } | undefined)?.venueId == null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <Link href="/owner-app" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-800 text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
              <KeyRound className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-[17px] font-semibold tracking-tight text-slate-900">
                Owner Portal
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                Davao Pickleball POS
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {isOwner &&
              ownerNavLinks.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "px-3.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center gap-1.5",
                    location === l.href
                      ? "bg-emerald-800 text-white"
                      : "text-slate-600 hover:bg-slate-100",
                  )}>
                  {l.icon && <l.icon className="h-4 w-4" />}
                  {l.label}
                </Link>
              ))}
            {isGlobalOwner && (
              <Link
                href="/owner-app/admin"
                className={cn(
                  "px-3.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center gap-1.5",
                  location === "/owner-app/admin"
                    ? "bg-emerald-800 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}>
                <Lock className="h-4 w-4" />
                System Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user && isOwner ? (
              <div className="flex items-center gap-2">
                <OwnerNotificationsBell />
                <span className="hidden md:flex items-center gap-2 text-sm text-slate-500">
                  <span className="max-w-36 truncate">{user.name ?? user.identity}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-xs font-medium">
                    Owner
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => ownerLogout.mutate()}>
                  Sign Out
                </Button>
              </div>
            ) : (
              <Link href="/owner-login">
                <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                  Sign In
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle menu">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileOpen && isOwner && (
          <nav className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-col gap-1 fade-in">
            {ownerNavLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "px-3 py-2.5 rounded-md text-sm font-medium flex items-center gap-2",
                  location === l.href
                    ? "bg-emerald-800 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}>
                {l.icon && <l.icon className="h-4 w-4" />}
                {l.label}
              </Link>
            ))}
            {isGlobalOwner && (
            <Link
              href="/owner-app/admin"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 text-slate-600 hover:bg-slate-100">
              <Lock className="h-4 w-4" />
              System Admin
            </Link>
            )}
            <div className="pt-2 mt-1 border-t border-slate-200 flex items-center">
              <OwnerNotificationsBell />
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container py-6 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-1">
          <span>© {new Date().getFullYear()} Davao Pickleball POS — Owner Portal</span>
          <span>Timezone: Asia/Manila (GMT+8)</span>
        </div>
      </footer>
    </div>
  );
}
