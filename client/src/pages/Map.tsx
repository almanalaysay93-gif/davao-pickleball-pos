import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { MapView } from "@/components/Map";
import {
  VenueGalleryHero,
  VenueLocationInfo,
} from "@/components/VenueLocation";
import { usePageMeta } from "@/lib/meta";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

/// <reference types="@types/google.maps" />

/** Davao City center fallback. */
const DAVAO_CENTER = { lat: 7.190708, lng: 125.455341 };

/** Build the Google Maps directions query, merging district/city tokens already present in the address. */
function directionsQuery(venue: {
  address: string;
  district?: string | null;
}): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    if (Array.from(seen).some(s => s.includes(key))) return;
    Array.from(seen)
      .filter(s => key.includes(s))
      .forEach(s => seen.delete(s));
    seen.add(key);
    parts.push(raw.trim());
  };
  add(venue.address);
  add(venue.district);
  if (!parts.some(p => p.toLowerCase().includes("davao"))) add("Davao City");
  parts.push("Philippines");
  return parts.join(", ");
}

/** Venue row in the side list — clicking focuses the venue on the combined map. */
function VenueListRow({
  venue,
  active,
  onClick,
}: {
  venue: {
    id: number;
    name: string;
    address: string;
    district?: string | null;
  };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "border-border bg-card transition-colors duration-150 hover:border-primary/50",
        active ? "ring-2 ring-primary border-primary" : "",
      )}>
      <CardContent className="p-4">
        <VenueLocationInfo venue={venue} />
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full press"
          onClick={onClick}>
          Show on map
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Combined interactive map: one large map with a pin for every venue.
 * Geocodes each venue address, drops an AdvancedMarker per venue, and offers
 * a "Show on map" venue list for quick comparison.
 */
function CombinedVenueMap({
  venues,
}: {
  venues: {
    id: number;
    name: string;
    address: string;
    district?: string | null;
  }[];
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  // Clear the marker cache whenever the venue list changes (route remount).
  useEffect(() => {
    markersRef.current.forEach(m => (m.map = null));
    markersRef.current = [];
  }, [venues.length]);

  const selectVenue = (venueId: number) => {
    setSelected(venueId);
    const marker = markersRef.current.find(m => m.title === String(venueId));
    const map = mapRef.current;
    if (!map || !marker?.position) return;
    const pos = marker.position as google.maps.LatLng;
    map.panTo(pos);
    map.setZoom(16);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* The single combined map */}
      <div className="lg:w-2/3 order-1 lg:order-2">
        <Card className="border-border bg-card overflow-hidden">
          <MapView
            className="h-[420px] md:h-[560px]"
            initialCenter={DAVAO_CENTER}
            initialZoom={12}
            onMapReady={map => {
              mapRef.current = map;
              const geocoder = new google.maps.Geocoder();
              let placed = 0;
              const geocodeNext = (idx: number) => {
                if (idx >= venues.length) return;
                const venue = venues[idx];
                geocoder.geocode(
                  { address: directionsQuery(venue) },
                  (results, status) => {
                    let loc = DAVAO_CENTER;
                    let zoom = 14;
                    if (status === "OK" && results && results[0]) {
                      loc = {
                        lat: results[0].geometry.location.lat(),
                        lng: results[0].geometry.location.lng(),
                      };
                      zoom = 15;
                    }
                    // Offset markers slightly when venues geocode to the same point
                    // (e.g. same barangay) so pins remain distinguishable.
                    const collision = markersRef.current.some(m => {
                      if (!m.position) return false;
                      const mp = {
                        lat: typeof m.position.lat === "function" ? m.position.lat() : m.position.lat,
                        lng: typeof m.position.lng === "function" ? m.position.lng() : m.position.lng,
                      } as google.maps.LatLngLiteral;
                      return (
                        Math.abs(mp.lat - loc.lat) < 0.0004 &&
                        Math.abs(mp.lng - loc.lng) < 0.0004
                      );
                    });
                    if (collision) {
                      loc = {
                        lat: loc.lat + 0.0008 * (placed % 4 - 1.5),
                        lng: loc.lng + 0.0008 * ((placed % 3) - 1),
                      };
                    }
                    const marker = new google.maps.marker.AdvancedMarkerElement({
                      map,
                      position: loc,
                      title: String(venue.id),
                    });
                    // Clicking a pin shows a simple info window with name + link.
                    marker.addListener("gmp-click", () => {
                      const info = new google.maps.InfoWindow({
                        content: `
                          <div style="font-family:system-ui,sans-serif;padding:4px">
                            <p style="font-weight:600;margin:0">${venue.name}</p>
                            <a href="/schedule?venueId=${venue.id}" style="color:#0f766e;text-decoration:underline;font-size:12px">View schedule</a>
                          </div>`,
                      });
                      info.open({ map, anchor: marker });
                      setSelected(venue.id);
                    });
                    markersRef.current.push(marker);
                    placed++;
                    // Fit the map around all markers as they arrive.
                    if (placed === venues.length && markersRef.current.length > 1) {
                      const bounds = new google.maps.LatLngBounds();
                      markersRef.current.forEach(m => bounds.extend(m.position as google.maps.LatLng));
                      map.fitBounds(bounds, 60);
                    }
                    // Center/zoom on the first successfully geocoded venue.
                    if (status === "OK" && placed === 1) {
                      map.setCenter(loc);
                      map.setZoom(zoom);
                    }
                    geocodeNext(idx + 1);
                  },
                );
              };
              geocodeNext(0);
            }}
          />
        </Card>
      </div>

      {/* Venue list — click a venue to focus it on the map */}
      <div className="lg:w-1/3 order-2 lg:order-1 flex flex-col gap-3">
        {venues.map(v => (
          <VenueListRow
            key={v.id}
            venue={v}
            active={selected === v.id}
            onClick={() => selectVenue(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Dedicated "Find your court" page — every venue in Davao on one combined
 * interactive map, with a comparison list. Split out from Home per feedback.
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
      "Browse every pickleball venue in Davao City on one map — 929 Pickleyard, Arena Athletics, CrisRon, Durian Pickleball House, Matina Town Square, Paddle Up Davao, PickleVille, and Southside Davao.",
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
            All venues on one map
          </h1>
          <p className="mt-4 text-base md:text-lg text-primary-foreground/75 leading-relaxed max-w-xl">
            Every pickleball venue in Davao City, side by side — pick a pin,
            compare locations, and head straight to the schedule.
          </p>
        </div>
      </section>

      <section className="container py-8 md:py-12">
        {isLoading ? (
          <div className="h-[420px] md:h-[560px] rounded-2xl bg-muted animate-pulse" />
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
            <div className="mt-8">
              <CombinedVenueMap venues={venues} />
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
