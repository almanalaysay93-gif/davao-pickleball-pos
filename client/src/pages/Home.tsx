import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPHP } from "@shared/rates";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  CircleDollarSign,
  Clock,
  LayoutGrid,
  MapPin,
  Receipt,
  Trophy,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePageMeta, type JsonLdItem } from "@/lib/meta";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { VenueLocationMap, VenueGalleryHero } from "@/components/VenueLocation";

const highlights = [
  {
    icon: LayoutGrid,
    title: "Live Availability",
    description:
      "An hourly grid across every court at every venue, refreshed in real time so you always know what is open.",
  },
  {
    icon: CalendarDays,
    title: "Schedule & Calendar",
    description:
      "Browse any date, filter by venue or time of day, and find the perfect slot before you leave home.",
  },
  {
    icon: Receipt,
    title: "Instant POS Checkout",
    description:
      "Itemized court-rate calculation with distinct daytime and nighttime tiers, followed by payment confirmation.",
  },
  {
    icon: MapPin,
    title: "Eight Premier Venues",
    description:
      "From Arena Athletics to 929 Pickleyard — every major Davao City pickleball destination in one place.",
  },
];

export default function Home() {
  const { data: venues, isLoading, error: venuesError } = trpc.venues.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: rates } = trpc.rates.all.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // JSON-LD LocalBusiness items for the venue directory (schema.org ItemList)
  const venueJsonLd: JsonLdItem[] = useMemo(
    () =>
      (venues ?? []).map(v => ({
        "@type": "SportsActivityLocation",
        name: v.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: v.address,
          addressLocality: "Davao City",
          addressCountry: "PH",
        },
        telephone: v.phone,
        url: `https://davaopickpos-jrhmrcab.manus.space/schedule?venueId=${v.id}`,
        description: v.description ?? `${v.name} — ${v.courtCount} pickleball court${v.courtCount === 1 ? "" : "s"} in ${v.district ?? "Davao City"}`,
      })),
    [venues],
  );

  usePageMeta({
    title: "Davao Pickleball POS — Book a Court in Minutes | Every Court in Davao",
    description:
      "Real-time availability, booking, and checkout for every pickleball court in Davao City. Browse live hourly slots across 8 venues and reserve your court in minutes.",
    venues: venueJsonLd,
  });

  const venueRates = (venueId: number) => {
    const t = (rates ?? []).filter(r => r.venueId === venueId);
    const day = t.find(r => r.tierName === "daytime");
    const night = t.find(r => r.tierName === "nighttime");
    return {
      dayRate: day ? formatPHP(Number(day.pricePerHour)).replace("₱", "") : "—",
      nightRate: night ? formatPHP(Number(night.pricePerHour)).replace("₱", "") : "—",
    };
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-[linear-gradient(160deg,oklch(0.27_0.06_165)_0%,oklch(0.32_0.07_165)_45%,oklch(0.24_0.05_200)_100%)]">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, oklch(0.78 0.13 85) 0%, transparent 45%), radial-gradient(circle at 80% 70%, oklch(0.6 0.09 155) 0%, transparent 40%)",
          }}
        />
        <div className="container relative py-14 md:py-28 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <div className="fade-in">
            <Badge variant="outline" className="border-accent/60 text-accent bg-accent/10 mb-5">
              Davao City · Point of Sale
            </Badge>
            <h1 className="text-[2.25rem] md:text-6xl font-semibold text-primary-foreground leading-[1.05] text-balance">
              Every court in Davao.
              <br />
              <span className="text-accent">Booked in minutes.</span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-primary-foreground/75 leading-relaxed max-w-xl">
              A refined point-of-sale system for pickleball — real-time availability, interactive
              scheduling, and seamless checkout across the city's finest venues.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book">
                <Button size="lg" className="press shadow-lg">
                  Book a Court
                </Button>
              </Link>
              <Link href="/courts">
                <Button size="lg" variant="outline" className="press border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent">
                  Explore Courts
                </Button>
              </Link>
            </div>
          </div>

          <div className="hidden lg:block fade-in">
            <Card className="bg-card/95 backdrop-blur shadow-2xl border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold">Today's Availability</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Live grid
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {(venues ?? []).slice(0, 5).map(v => (
                    <div key={v.id} className="flex items-center gap-3">
                      <span className="w-36 text-xs font-medium truncate">{v.name}</span>
                      <div className="flex-1 flex gap-1">
                        {Array.from({ length: 16 }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-3 flex-1 rounded-[3px] ${
                              [2, 5, 8, 11, 14].includes(i + v.id)
                                ? "bg-accent/70"
                                : [3, 9, 12].includes(i + v.id)
                                  ? "bg-border"
                                  : "bg-success/45"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {v.openTime.slice(0, 5)}–{v.closeTime.slice(0, 5) === "00:00" ? "24:00" : v.closeTime.slice(0, 5)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[3px] bg-success/45" /> Available</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[3px] bg-accent/70" /> Occupied</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[3px] bg-border" /> Maintenance</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="container py-12 md:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            A complete court-side experience
          </p>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
            Built for players, front desk staff, and operators
          </h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 stagger">
          {highlights.map(h => (
            <Card key={h.title} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <h.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{h.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{h.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Venue directory preview */}
      <section className="border-t border-border bg-card/60">
        <div className="container py-16 md:py-20">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Court directory
              </p>
              <h2 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
                Major pickleball venues across Davao City
              </h2>
            </div>
            <Link href="/courts">
              <Button variant="outline" className="press bg-transparent">View all venues</Button>
            </Link>
          </div>

          {venuesError ? (
            <p className="mt-8 text-sm text-destructive">Unable to load venues: {venuesError.message}. Please try again shortly.</p>
          ) : isLoading ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
              {(venues ?? []).map(v => (
                <Link key={v.id} href={`/schedule?venueId=${v.id}`}>
                  <Card className="group h-full border-border bg-background hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden">
                    <CardContent className="p-5">
                      {v.imageKey ? (
                        <img
                          src={`/manus-storage/${v.imageKey}`}
                          alt={`${v.name} venue photo`}
                          className="-mx-5 -mt-5 mb-3 w-[calc(100%+2.5rem)] h-36 object-cover" />
                      ) : (
                        <div className="-mx-5 -mt-5 mb-3 w-[calc(100%+2.5rem)] h-36 bg-gradient-to-br from-primary/15 via-accent/10 to-background flex items-center justify-center">
                          <Trophy className="h-7 w-7 text-primary/40" />
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-lg font-semibold leading-tight group-hover:text-primary transition-colors">
                          {v.name}
                        </h3>
                        <Badge variant="secondary" className="shrink-0">
                          {v.courtCount} {v.courtCount === 1 ? "court" : "courts"}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{v.address}</span>
                      </p>
                      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CircleDollarSign className="h-3.5 w-3.5" />
                          Day ₱{venueRates(v.id).dayRate} / Night ₱{venueRates(v.id).nightRate}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {v.surfaceType}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Venue notices posted by owners */}
      <section className="container pt-8">
        <AnnouncementsBanner />
      </section>

      {/* Map of all venues */}
      {venues && venues.length > 0 && !isLoading && (
        <section className="container py-8 md:py-14">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Find your court
            </p>
            <h2 className="mt-3 text-2xl md:text-3xl font-semibold text-balance">
              All venues on the map
            </h2>
          </div>
          {/* Photo gallery hero at the top of the venue section */}
          <div className="mt-6">
            <VenueGalleryHero venue={venues[0]} />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {venues.map(v => (
              <VenueLocationMap key={v.id} venue={v} />
            ))}
          </div>
        </section>
      )}

      <section className="container py-12 md:py-20">
        <div className="rounded-2xl bg-primary text-primary-foreground px-6 py-10 md:px-14 md:py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold text-balance">
              Ready to play? Reserve your court today.
            </h2>
            <p className="mt-2 text-primary-foreground/70 text-sm md:text-base max-w-lg">
              Walk-in or online — same seamless flow, from slot selection to receipt.
            </p>
          </div>
          <Link href="/schedule">
            <Button
              size="lg"
              variant="secondary"
              className="press text-secondary-foreground font-semibold shadow-lg">
              Check availability
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
