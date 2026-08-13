import { Card, CardContent } from "@/components/ui/card";
import { MapPin, ImageOff } from "lucide-react";
import { useRef } from "react";

/** Dedupe repeated place-name tokens so addresses like "Tugbok, Davao City, Tugbok, Davao City" collapse to "Tugbok, Davao City". */
function dedupeAddress(address: string): string {
  const lower = address.toLowerCase();
  if (lower.includes("davao")) return address;
  return `${address}, Davao City`;
}

/** Build the Google Maps directions query, merging district/city tokens already present in the address. */
function directionsQuery(venue: { address: string; district?: string | null }): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    // Collapse sub-strings (e.g. address "Tugbok" should not coexist with district "Tugbok").
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

interface VenueLocationProps {
  venue: {
    id: number;
    name: string;
    address: string;
    district?: string | null;
    imageKey?: string | null;
  };
  className?: string;
}

/** Geocodes the venue address and renders a Google Map plus the venue photo. */
export function VenueLocation({ venue, className }: VenueLocationProps) {
  const mapRef = useRef<google.maps.Map | null>(null);

  return (
    <Card className={`border-border bg-card ${className ?? ""}`}>
      <CardContent className="p-5 md:p-6">
        <div className="flex items-start gap-2">
          <MapPin className="h-4.5 w-4.5 mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-display font-semibold">{venue.name}</p>
            <p className="text-sm text-muted-foreground">{dedupeAddress(venue.address)}</p>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery(venue))}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-wide text-accent underline-offset-2 hover:underline">
            Get directions
          </a>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
          <VenueMap venue={venue} mapRef={mapRef} />
          {venue.imageKey ? (
            <img
              src={`/manus-storage/${venue.imageKey}`}
              alt={`${venue.name} venue photo`}
              className="w-full h-44 lg:h-full min-h-44 rounded-md object-cover border border-border"
            />
          ) : (
            <div className="w-full h-44 lg:h-full min-h-44 rounded-md border border-dashed border-border bg-background/60 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <ImageOff className="h-5 w-5" />
              <p className="text-[11px]">No photo yet</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { MapView } from "@/components/Map";

function VenueMap({
  venue,
  mapRef,
}: {
  venue: { name: string; address: string; district?: string | null };
  mapRef: React.MutableRefObject<google.maps.Map | null>;
}) {
  return (
    <div className="rounded-md overflow-hidden border border-border">
      <MapView
        className="h-[300px]"
        initialCenter={{ lat: 7.190708, lng: 125.455341 }}
        initialZoom={13}
        onMapReady={map => {
          mapRef.current = map;
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ address: directionsQuery(venue) }, (results, status) => {
            if (status === "OK" && results && results[0]) {
              const loc = results[0].geometry.location;
              map.setCenter(loc);
              map.setZoom(15);
              new google.maps.marker.AdvancedMarkerElement({
                map,
                position: loc,
                title: venue.name,
              });
            } else {
              // Fallback: center on the venue district in Davao.
              new google.maps.marker.AdvancedMarkerElement({
                map,
                position: { lat: 7.190708, lng: 125.455341 },
                title: venue.name,
              });
            }
          });
        }}
      />
    </div>
  );
}
