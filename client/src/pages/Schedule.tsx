import AvailabilityGrid from "@/components/AvailabilityGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatHour } from "@shared/rates";
import { format, startOfDay } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/meta";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { JoinWaitlistDialog } from "@/components/OwnerFeatureSections";
import { VenueLocationMap, VenueGalleryHero } from "@/components/VenueLocation";

type TimeFilter = "all" | "morning" | "afternoon" | "evening";

const todayStr = () => format(startOfDay(new Date()), "yyyy-MM-dd");

export default function Schedule() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const initialVenueId = Number(params.get("venueId")) || null;

  const { data: venues } = trpc.venues.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const [venueId, setVenueId] = useState<number | null>(initialVenueId ?? null);
  const [waitlist, setWaitlist] = useState<{ courtId: number; hour: string } | null>(null);

  // Default to the first venue once the list has loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shouldDefault = !venueId && !initialVenueId;

  const [playerDate, setPlayerDate] = useState(todayStr());
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const availability = trpc.availability.forVenueDate.useQuery(
    { venueId: venueId ?? 1, playerDate },
    {
      enabled: venueId !== null,
      refetchOnWindowFocus: false,
      refetchInterval: 15000, // refresh grid every 15 seconds for near-real-time status
    },
  );

  // Apply the venue default once when the venue list arrives.
  useEffect(() => {
    if (!venueId && !initialVenueId && venues?.[0]) {
      setVenueId(venues[0].id);
    }
  }, [venueId, initialVenueId, venues]);

  const queryError = availability.error;

  const selectedVenue = venues?.find(v => v.id === venueId);
  usePageMeta({
    title: selectedVenue
      ? `${selectedVenue.name} — Schedule & Availability | Davao Pickleball POS`
      : "Schedule & Availability — Pickleball Courts Davao | Davao Pickleball POS",
    description: selectedVenue
      ? `Hourly court availability at ${selectedVenue.name} in ${selectedVenue.district ?? "Davao City"} for ${playerDate}. Book your slot in minutes.`
      : `Browse hourly court availability across Davao City's pickleball venues for any date and book your slot in minutes.`,
  });

  // Hooks must run on every render — keep useMemo above any early return.
  const filtered = useMemo(() => {
    const data = availability.data;
    if (!data) return null;
    let slots = data.slots;
    if (timeFilter === "morning") slots = slots.filter(h => toMin(h) < toMin("12:00"));
    if (timeFilter === "afternoon") slots = slots.filter(h => toMin(h) >= toMin("12:00") && toMin(h) < toMin("18:00"));
    if (timeFilter === "evening") slots = slots.filter(h => toMin(h) >= toMin("18:00"));
    return { ...data, slots };
  }, [availability.data, timeFilter]);

  if (!availability.data && !queryError) {
    return (
      <div className="container py-16">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-background p-10 text-center">
          <Clock className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading today's schedule…</p>
        </div>
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="container py-16">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-background p-10 text-center">
          <p className="text-sm text-destructive">Unable to load the schedule. Please try again shortly.</p>
        </div>
      </div>
    );
  }



  const changeDay = (delta: number) => {
    const d = new Date(`${playerDate}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setPlayerDate(format(d, "yyyy-MM-dd"));
    setWaitlist(null);
  };

  const waitlistVenueId = venueId ?? selectedVenue?.id ?? 0;
  const waitlistCourt = waitlist
    ? filtered?.courts.find(c => c.id === waitlist.courtId)
    : undefined;

  const handleSelect = (courtId: number, hour: string) => {
    if (!filtered) return;
    const court = filtered.courts.find(c => c.id === courtId);
    const venue = filtered.venue;
    if (!court || !venue) return;
    // Navigate to the booking form with this selection
    const q = new URLSearchParams({
      venueId: String(venue.id),
      courtId: String(courtId),
      playerDate,
      startHour: hour,
      endHour: nextHour(hour),
    });
    navigate(`/book?${q.toString()}`);
  };

  const venue = venues?.find(v => v.id === venueId);

  return (
    <div className="container py-7 md:py-14 fade-in">
      {/* Photo gallery hero at the very top of the page */}
      {venue && (
        <div className="-mt-2 mb-6 md:mb-8">
          <VenueGalleryHero venue={venue} />
        </div>
      )}

      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          Schedule &amp; availability
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
          Browse courts by date
        </h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Pick a venue and a date to view the live hourly grid. Tap an open slot to start your
          reservation — tap a booked slot to join the waitlist instead.
        </p>
      </div>

      {/* Venue notices posted by owners */}
      {venueId !== null && (
        <div className="mt-6">
          <AnnouncementsBanner venueId={venueId} />
        </div>
      )}

      {/* Filters */}
      <Card className="mt-8 border-border bg-card">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_auto_auto_auto] items-center">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Select
                value={venueId !== null ? String(venueId) : undefined}
                onValueChange={v => setVenueId(Number(v))}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Select venue" />
                </SelectTrigger>
                <SelectContent>
                  {venues?.map(v => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 press bg-transparent" onClick={() => changeDay(-1)} aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 px-2 text-sm font-medium min-w-[150px] justify-center">
                <CalendarIcon className="h-4 w-4 text-accent" />
                {formatDate(playerDate)}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 press bg-transparent" onClick={() => changeDay(1)} aria-label="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select value={timeFilter} onValueChange={v => setTimeFilter(v as TimeFilter)}>
              <SelectTrigger className="w-full md:w-40 bg-background">
                <SelectValue placeholder="Time of day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All hours</SelectItem>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="afternoon">Afternoon</SelectItem>
                <SelectItem value="evening">Evening</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              className="press bg-transparent w-full md:w-auto"
              onClick={() => {
                setPlayerDate(todayStr());
                setTimeFilter("all");
              }}>
              Today
            </Button>
          </div>
        </CardContent>
      </Card>

      {availability.isLoading ? (
        <div className="mt-6 h-64 rounded-lg bg-muted animate-pulse" />
      ) : filtered ? (
        <div className="mt-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="font-display text-xl font-semibold">
              {venue?.name} · {formatDate(playerDate)}
            </h2>
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Asia/Manila · hourly slots
            </span>
          </div>

          {filtered.courts.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-10 text-center text-muted-foreground">
                No courts at this venue.
              </CardContent>
            </Card>
          ) : (
            <>
              <AvailabilityGrid
                slots={filtered.slots}
                courts={filtered.courts}
                tiers={filtered.tiers}
                selected={{ courtId: null, hour: null }}
                onSelect={handleSelect}
                interactive={false}
                onFullSlot={(courtId, hour) => setWaitlist({ courtId, hour })}
              />

              {waitlist && waitlistVenueId && waitlistCourt && (
                <JoinWaitlistDialog
                  venueId={waitlistVenueId}
                  courtId={waitlist.courtId}
                  courtNumber={waitlistCourt.courtNumber}
                  playerDate={playerDate}
                  startHour={waitlist.hour}
                  endHour={nextHour(waitlist.hour)}
                  open={!!waitlist}
                  onOpenChange={open => { if (!open) setWaitlist(null); }}
                />
              )}
            </>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Daytime hours are charged at the daytime rate; evening hours at the nighttime rate.
            Slots spanning both tiers are split automatically at checkout.
          </p>
        </div>
      ) : (
        <Card className="mt-6 border-border">
          <CardContent className="p-10 text-center text-muted-foreground">
            Select a venue above to view its schedule.
          </CardContent>
        </Card>
      )}

      {/* Map with venue info, directly below the slot picker */}
      {venue && (
        <div className="mt-6">
          <VenueLocationMap venue={venue} />
        </div>
      )}
    </div>
  );
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function nextHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + (m || 0) + 60;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
