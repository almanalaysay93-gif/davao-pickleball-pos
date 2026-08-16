import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { VenueLocationMap, VenueGalleryHero } from "@/components/VenueLocation";
import { usePageMeta } from "@/lib/meta";
import { trpc } from "@/lib/trpc";

/**
 * Dedicated "Find your court" page — every venue in Davao with its photo,
 * geocoded map, and directions link. Split out from Home per user feedback.
 */
export default function MapPage() {
  const { data: venues, isLoading } = trpc.venues.list.useQuery();

  usePageMeta({
    title: useMemo(
      () =>
        venues && venues.length > 0
          ? `Find your court — ${venues.length} venues across Davao City | Davao Pickleball`
          : "Find your court | Davao Pickleball",
      [venues],
    ),
    description:
      "Browse every pickleball venue in Davao City on the map — 929 Pickleyard, Arena Athletics, CrisRon, Durian Pickleball House, Matina Town Square, Paddle Up Davao, PickleVille, and Southside Davao.",
  });

  // JSON-LD structured data for the venue directory (same as Home)
  useEffect(() => {
    if (!venues || venues.length === 0) return;
    const items = venues.map((v: any) => ({
      "@type": "SportsActivityLocation",
      name: v.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: v.address,
        addressLocality: "Davao City",
        addressCountry: "PH",
      },
      ...(v.phone ? { telephone: v.phone } : {}),
    }));
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Pickleball venues in Davao City",
      itemListElement: items,
    });
    script.id = "jsonld-venues-map";
    document.head.appendChild(script);
    return () => {
      document.getElementById("jsonld-venues-map")?.remove();
    };
  }, [venues]);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border bg-[linear-gradient(160deg,oklch(0.27_0.06_165)_0%,oklch(0.32_0.07_165)_45%,oklch(0.24_0.05_200)_100%)]">
        <div className="container relative py-12 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            Find your court
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-primary-foreground text-balance max-w-2xl">
            All venues on the map
          </h1>
          <p className="mt-4 text-base md:text-lg text-primary-foreground/75 leading-relaxed max-w-xl">
            Every pickleball venue in Davao City — pick one, see it on the map,
            and head straight to the schedule.
          </p>
        </div>
      </section>

      <section className="container py-8 md:py-12">
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-72 rounded-2xl bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : !venues || venues.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No venues yet — check back soon.
          </div>
        ) : (
          <>
            {/* Featured venue gallery at the top */}
            <div>
              <VenueGalleryHero venue={venues[0]} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {venues.map(v => (
                <VenueLocationMap key={v.id} venue={v} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="container pb-12 md:pb-16">
        <div className="rounded-2xl bg-primary text-primary-foreground px-6 py-10 md:px-14 md:py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold text-balance">
              Ready to play? Reserve your court today.
            </h2>
            <p className="mt-2 text-primary-foreground/70 text-sm md:text-base max-w-lg">
              Walk-in or online — same seamless flow, from slot selection to
              receipt.
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
