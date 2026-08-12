import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startLogin } from "@/const";
import { CalendarDays, CircleDot, KeyRound, LayoutGrid, Lock, MapPin, Menu, Receipt, UserRound, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/courts", label: "Courts", icon: MapPin },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/book", label: "Book a Court", icon: LayoutGrid },
];

export default function SiteLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const isOwner = user?.role === "owner";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/92 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-105">
              <CircleDot className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-[17px] font-semibold tracking-tight text-foreground">
                Davao Pickleball
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Point of Sale
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3.5 py-2 rounded-md text-sm font-medium transition-colors duration-150",
                  location === l.href
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/75 hover:bg-secondary hover:text-secondary-foreground",
                )}>
                {l.label}
              </Link>
            ))}
            {isOwner && (
              <Link
                href="/owner"
                className={cn(
                  "px-3.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center gap-1.5",
                  location === "/owner"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/75 hover:bg-secondary hover:text-secondary-foreground",
                )}>
                <KeyRound className="h-3.5 w-3.5" />
                Owner
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  "px-3.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center gap-1.5",
                  location === "/admin"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/75 hover:bg-secondary hover:text-secondary-foreground",
                )}>
                <Lock className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/book">
              <Button className="hidden sm:inline-flex press">Book Now</Button>
            </Link>
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

        {mobileOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-3 flex flex-col gap-1 fade-in">
            {navLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "px-3 py-2.5 rounded-md text-sm font-medium flex items-center gap-2",
                  location === l.href
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/75 hover:bg-secondary",
                )}>
                {l.icon && <l.icon className="h-4 w-4" />}
                {l.label}
              </Link>
            ))}
            {isOwner && (
              <Link
                href="/owner"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 text-foreground/75 hover:bg-secondary">
                <KeyRound className="h-4 w-4" />
                Owner Dashboard
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 text-foreground/75 hover:bg-secondary">
                <Receipt className="h-4 w-4" />
                Admin Dashboard
              </Link>
            )}
            {user && (
              <Link
                href="/my-bookings"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 text-foreground/75 hover:bg-secondary">
                <UserRound className="h-4 w-4" />
                My Bookings
              </Link>
            )}
            {!user && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => startLogin()}>
                Staff Sign In
              </Button>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="container py-10 grid gap-8 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CircleDot className="h-4 w-4" />
              </span>
              <span className="font-display font-semibold">Davao Pickleball POS</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xs">
              Real-time court availability, scheduling, and point-of-sale for pickleball venues
              across Davao City.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Quick Links
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/courts" className="hover:text-primary transition-colors">Court Directory</Link></li>
              <li><Link href="/schedule" className="hover:text-primary transition-colors">Schedule & Availability</Link></li>
              <li><Link href="/book" className="hover:text-primary transition-colors">Book a Court</Link></li>
              {user && (
                <li><Link href="/my-bookings" className="hover:text-primary transition-colors">My Bookings</Link></li>
              )}
              {isOwner && (
                <li><Link href="/owner" className="hover:text-primary transition-colors">Owner Dashboard</Link></li>
              )}
              {isAdmin && (
                <li><Link href="/admin" className="hover:text-primary transition-colors">Admin Dashboard</Link></li>
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Coverage
            </h4>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Arena Athletics · Southside Davao · Matina Town Square · Paddle Up Davao · CrisRon ·
              PickleVille · Durian Pickleball House · 929 Pickleyard
            </p>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="container py-4 text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-1">
            <span>© {new Date().getFullYear()} Davao Pickleball POS</span>
            <span>Timezone: Asia/Manila (GMT+8)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
