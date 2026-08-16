import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { CalendarDays, CircleDot, LayoutGrid, LogIn, MapPin, Menu, UserRound, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";

const navLinks = [
  { href: "/", label: "Home", icon: CircleDot },
  { href: "/courts", label: "Courts", icon: MapPin },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/book", label: "Book a Court", icon: LayoutGrid },
];

/**
 * Customer-facing app shell. Strictly customer features only — no owner or
 * admin navigation, links, or references.
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = trpc.auth.logout.useMutation();

  // The customer app only recognizes customer sessions. Owner sessions are
  // invisible here — owners log in to the separate owner portal.
  const isCustomer = user?.type === "customer";
  const signedInCustomer = user && isCustomer;
  const showMyBookings = true;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/92 backdrop-blur-xl">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 group min-w-0 shrink">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-105">
              <CircleDot className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-[17px] font-semibold tracking-tight text-foreground truncate">
                Davao Pickleball
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground truncate">
                Book a Court
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5">
            {navLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap",
                  location === l.href
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/75 hover:bg-secondary hover:text-secondary-foreground",
                )}>
                {l.icon && <l.icon className="h-4 w-4 shrink-0" />}
                <span className="hidden xl:inline">{l.label}</span>
              </Link>
            ))}
            {showMyBookings && (
              <Link
                href="/my-bookings"
                className={cn(
                  "px-3.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap",
                  location === "/my-bookings"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/75 hover:bg-secondary hover:text-secondary-foreground",
                )}>
                <UserRound className="h-4 w-4 shrink-0" />
                <span className="hidden xl:inline">My Bookings</span>
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {signedInCustomer ? (
              <div className="flex items-center gap-2">
                <span className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                  <UserRound className="h-4 w-4" />
                  <span className="max-w-28 truncate">{user.name ?? user.identity}</span>
                </span>
                <Button variant="outline" size="sm" onClick={() => logout.mutate()}>
                  Sign Out
                </Button>
              </div>
            ) : (
              <Link href="/customer-login">
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:inline-flex border-primary/40 text-primary hover:bg-primary/10 whitespace-nowrap">
                  <UserRound className="h-4 w-4 mr-1" />
                  Sign In
                </Button>
              </Link>
            )}
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
            <Link
              href="/my-bookings"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 rounded-md text-sm font-medium flex items-center gap-2 text-foreground/75 hover:bg-secondary">
              <UserRound className="h-4 w-4" />
              My Bookings
            </Link>
            {signedInCustomer ? (
              <>
                <span className="px-3 text-xs text-muted-foreground truncate max-w-40">
                  {user.name ?? user.identity}
                </span>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => logout.mutate()}>
                  Sign Out
                </Button>
              </>
            ) : (
              <Link href="/customer-login" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" size="sm" className="mt-2">
                  <LogIn className="h-4 w-4 mr-1" /> Sign In
                </Button>
              </Link>
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
              <li><Link href="/my-bookings" className="hover:text-primary transition-colors">My Bookings</Link></li>
              <li><Link href="/booking-policy" className="hover:text-primary transition-colors">Booking Policy</Link></li>
              {!signedInCustomer && (
                <li><Link href="/customer-login" className="hover:text-primary transition-colors">Create account</Link></li>
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
