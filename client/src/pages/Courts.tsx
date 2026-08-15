import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatHour, formatPHP } from "@shared/rates";
import {
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  Sunrise,
  Moon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/meta";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { MapView } from "@/components/Map";
import { GalleryCarousel } from "@/components/GalleryCarousel";

export default function Courts() {
  const { data: venues, isLoading } = trpc.venues.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: rates } = trpc.rates.all.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);

  const venueTiers = (venueId: number) =>
    (rates ?? []).filter(r => r.venueId === venueId);

  const detail = venues?.find(v => v.id === selectedVenueId);
  const detailTiers = selectedVenueId ? venueTiers(selectedVenueId) : [];

  usePageMeta({
    title: detail
      ? `${detail.name} — Pickleball Courts in Davao City | Davao Pickleball POS`
      : "Court Directory — Every Pickleball Venue in Davao | Davao Pickleball POS",
    description: detail
      ? `${detail.name}: ${detail.courtCount} courts, ${detail.address}, Davao City. See live availability and book hourly slots.`
      : "Browse every major pickleball venue in Davao City — court counts, rates, addresses, and live availability in one directory.",
  });

  return (
    <div className="container py-7 md:py-14 fade-in">
      <div className="space-y-6">
        <AnnouncementsBanner />
      </div>
      <div className="mt-6 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          Court directory
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
          Every major pickleball venue in Davao City
        </h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Eight premier destinations, 56 courts, and transparent daytime &amp; nighttime pricing —
          all in one view. Click any venue for full details.
        </p>
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {venues?.map(v => {
            const tiers = venueTiers(v.id);
            const day = tiers.find(t => t.tierName === "daytime");
            const night = tiers.find(t => t.tierName === "nighttime");
            return (
              <Card
                key={v.id}
                className="group h-full border-border bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer"
                onClick={() => setSelectedVenueId(v.id)}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-xl font-semibold leading-tight group-hover:text-primary transition-colors">
                      {v.name}
                    </h2>
                    <Badge variant="secondary" className="shrink-0 mt-0.5">
                      {v.courtCount} {v.courtCount === 1 ? "court" : "courts"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground flex items-start gap-1.5 leading-snug">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-accent" />
                    {v.address}
                  </p>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {formatHour(v.openTime)} – {v.closeTime === "00:00" ? "12:00 AM (midnight)" : formatHour(v.closeTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Sunrise className="h-3.5 w-3.5 text-day" />
                      <span>Daytime: <strong>{day ? formatPHP(Number(day.pricePerHour)) : "—"}/hr</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Moon className="h-3.5 w-3.5 text-night" />
                      <span>Nighttime: <strong>{night ? formatPHP(Number(night.pricePerHour)) : "—"}/hr</strong></span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="text-[11px]">{v.surfaceType}</Badge>
                      {v.district && <Badge variant="outline" className="text-[11px]">{v.district}</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 group-hover:text-primary transition-colors">
                      Details <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={selectedVenueId !== null} onOpenChange={o => !o && setSelectedVenueId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <VenueGalleryCarousel venueId={detail.id} venueName={detail.name} imageKey={detail.imageKey} />
              <DialogHeader>
                <DialogTitle className="text-2xl">{detail.name}</DialogTitle>
                <DialogDescription className="flex items-start gap-1.5 pt-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {detail.address}
                  {detail.phone && (
                    <span className="flex items-center gap-1 mt-1">
                      <Phone className="h-3.5 w-3.5" /> {detail.phone}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                {detail.description}
              </p>
              <div className="rounded-lg bg-secondary/60 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Clock className="h-3.5 w-3.5" /> Operating Hours
                  </span>
                  <span>
                    {formatHour(detail.openTime)} – {detail.closeTime === "00:00" ? "12:00 AM" : formatHour(detail.closeTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Sunrise className="h-3.5 w-3.5 text-day" /> Daytime Rate
                  </span>
                  <span>
                    {dayRate(detailTiers)} per hour
                    <span className="text-xs text-muted-foreground ml-1">
                      ({formatHour(detailTiers.find(t => t.tierName === "daytime")?.startHour ?? "")}–{formatHour(detailTiers.find(t => t.tierName === "daytime")?.endHour ?? "")})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Moon className="h-3.5 w-3.5 text-night" /> Nighttime Rate
                  </span>
                  <span>
                    {nightRate(detailTiers)} per hour
                    <span className="text-xs text-muted-foreground ml-1">
                      ({formatHour(detailTiers.find(t => t.tierName === "nighttime")?.startHour ?? "")}–{formatHour(detailTiers.find(t => t.tierName === "nighttime")?.endHour ?? "")})
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{detail.courtCount} courts</span>
                  <Badge variant="outline">{detail.surfaceType}</Badge>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  className="press bg-transparent"
                  onClick={() => setSelectedVenueId(null)}>
                  Close
                </Button>
                <Link href={`/schedule?venueId=${detail.id}`}>
                  <Button className="press">Check availability</Button>
                </Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VenueGalleryCarousel({
  venueId,
  venueName,
  imageKey,
}: {
  venueId: number;
  venueName: string;
  imageKey?: string | null;
}) {
  const gallery = trpc.venues.gallery.useQuery({ venueId }, {
    enabled: venueId > 0,
    refetchOnWindowFocus: false,
  });
  const images =
    gallery.data && gallery.data.length > 0
      ? gallery.data
      : imageKey
        ? [{ id: 0, imageKey }]
        : [];
  return <GalleryCarousel images={images} venueName={venueName} className="-mx-6 -mt-6 mb-4" />;
}

function VenueMap({ venue }: { venue: { name: string; address: string; district?: string | null } }) {
  return (
    <MapView
      className="h-44"
      initialCenter={{ lat: 7.190708, lng: 125.455341 }}
      initialZoom={13}
      onMapReady={map => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode(
          { address: `${venue.address}, ${venue.district ?? "Davao City"}, Philippines` },
          (results, status) => {
            if (status === "OK" && results && results[0]) {
              const loc = results[0].geometry.location;
              map.setCenter(loc);
              map.setZoom(15);
              new google.maps.marker.AdvancedMarkerElement({ map, position: loc, title: venue.name });
            } else {
              new google.maps.marker.AdvancedMarkerElement({
                map,
                position: { lat: 7.190708, lng: 125.455341 },
                title: venue.name,
              });
            }
          },
        );
      }}
    />
  );
}

type Tier = { id: number; venueId: number; tierName: "daytime" | "nighttime"; startHour: string; endHour: string; pricePerHour: string | number };

function dayRate(tiers: Tier[]) {
  const day = tiers.find(t => t.tierName === "daytime");
  return day ? formatPHP(Number(day.pricePerHour)) : "—";
}
function nightRate(tiers: Tier[]) {
  const night = tiers.find(t => t.tierName === "nighttime");
  return night ? formatPHP(Number(night.pricePerHour)) : "—";
}
