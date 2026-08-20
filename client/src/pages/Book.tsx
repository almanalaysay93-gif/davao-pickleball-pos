import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatHour, formatPHP } from "@shared/rates";
import { Clock, Moon, ReceiptText, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/meta";
import { useBooking } from "@/contexts/BookingContext";
import { AnnouncementsBanner } from "@/components/AnnouncementsBanner";
import { VenueLocationMap, VenueGalleryHero } from "@/components/VenueLocation";

export default function Book() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { setDraft, draft } = useBooking();

  const { data: venues, isLoading: venuesLoading, error: venuesError } = trpc.venues.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const params = useMemo(() => new URLSearchParams(search), [search]);
  const initVenue = Number(params.get("venueId")) || draft.venueId;
  const initCourt = Number(params.get("courtId")) || draft.courtId;
  const initDate = params.get("playerDate") || draft.playerDate || todayStr();
  const initStart = params.get("startHour") || draft.startHour;

  const [venueId, setVenueId] = useState<number | null>(initVenue ?? null);
  const [courtId, setCourtId] = useState<number | null>(initCourt ?? null);
  const [playerDate, setPlayerDate] = useState(initDate);
  const [startHour, setStartHour] = useState<string | null>(initStart ?? null);
  const [duration, setDuration] = useState(1); // hours
  const [playerName, setPlayerName] = useState(draft.playerName ?? "");
  const [contact, setContact] = useState(draft.contact ?? "");
  const [playerEmail, setPlayerEmail] = useState(draft.playerEmail ?? "");

  const bookVenue = venues?.find(v => v.id === venueId);
  usePageMeta({
    title: bookVenue
      ? `Book ${bookVenue.name} — Pickleball Court Davao | Davao Pickleball POS`
      : "Book a Court — Instant Pickleball Booking in Davao | Davao Pickleball POS",
    description: "Reserve a pickleball court in Davao City in minutes: pick your venue, date, and hourly slot, then check out instantly.",
  });

  const courts = trpc.courts.byVenue.useQuery(
    { venueId: venueId ?? 1 },
    { enabled: venueId !== null, refetchOnWindowFocus: false },
  );
  const rates = trpc.rates.byVenue.useQuery(
    { venueId: venueId ?? 1 },
    { enabled: venueId !== null, refetchOnWindowFocus: false },
  );
  const availability = trpc.availability.forVenueDate.useQuery(
    { venueId: venueId ?? 1, playerDate },
    { enabled: venueId !== null, refetchOnWindowFocus: false },
  );

  const endHour = useMemo(() => {
    if (!startHour) return null;
    const t = toMin(startHour) + duration * 60;
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }, [startHour, duration]);

  const quote = trpc.bookings.quote.useQuery(
    {
      venueId: venueId ?? 0,
      courtId: courtId ?? 0,
      playerDate: playerDate || "1970-01-01",
      startHour: startHour ?? "00:00",
      endHour: endHour ?? "01:00",
      playerName: "_",
      channel: draft.channel,
    },
    { enabled: Boolean(venueId && startHour && endHour), refetchOnWindowFocus: false },
  );

  const venue = venues?.find(v => v.id === venueId);

  /**
   * Whether the quote for the current selection is still on the wire.
   *
   * submit() freezes the quote into the draft, so a click that lands first
   * used to freeze it at zero and checkout then read "Total ₱0.00" for a
   * booking the server priced at the real amount. Gating the click is the
   * cheapest place to make that impossible: the snapshot is only ever taken
   * here. An errored quote deliberately leaves the button live, so submit()
   * can say why nothing happened instead of the button sitting dead.
   */
  const priceInFlight = Boolean(venueId && startHour && endHour) && !quote.data && !quote.isError;

  // Hooks must run on every render — compute before any early return.
  const startOptions = useMemo(() => {
    if (!availability.data || startHour === null) return availability.data?.slots ?? [];
    return availability.data.slots.filter(slotStart => {
      const end = toMin(slotStart) + duration * 60;
      if (end > toMin(availability.data.venue.closeTime)) return false;
      const c = availability.data.courts.find(c => c.id === courtId);
      if (!c) return false;
      for (let t = toMin(slotStart); t + 60 <= end; t += 60) {
        const hh = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        if (c.occupied.includes(hh)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability.data, courtId, duration, startHour]);

  if (venuesLoading) {
    return (
      <div className="container py-16">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-background p-10 text-center">
          <Clock className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading venues…</p>
        </div>
      </div>
    );
  }
  if (venuesError || (venues ?? []).length === 0) {
    return (
      <div className="container py-16">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-background p-10 text-center">
          <p className="text-sm text-destructive">Unable to load venues. Please try again shortly.</p>
        </div>
      </div>
    );
  }



  const submit = () => {
    if (!playerName.trim()) {
      toast.error("Please enter the player's name");
      return;
    }
    if (!venueId || !courtId || !playerDate || !startHour || !endHour) {
      toast.error("Please complete the venue, court, date, and time selection");
      return;
    }
    if (!quote.data) {
      toast.error("Still working out the price for this slot. Please try again in a moment.");
      return;
    }
    const court = courts.data?.find(c => c.id === courtId);
    setDraft({
      venueId,
      courtId,
      courtNumber: court?.courtNumber ?? null,
      venueName: venue?.name ?? null,
      playerDate,
      startHour,
      endHour,
      playerName: playerName.trim(),
      contact: contact.trim() || null,
      playerEmail: playerEmail.trim() || null,
      dayAmount: quote.data.dayAmount,
      nightAmount: quote.data.nightAmount,
      total: quote.data.total,
    });
    navigate("/checkout");
  };

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
          Reservation
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
          Book your court
        </h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Select your venue, court, and time. Pricing distinguishes daytime from nighttime tiers
          and splits automatically when a session crosses 6:00 PM.
        </p>
      </div>

      {/* Venue notices posted by owners */}
      {venueId !== null && (
        <div className="mt-6">
          <AnnouncementsBanner venueId={venueId} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px] items-start">
        <Card className="border-border bg-card">
          <CardContent className="p-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Venue</Label>
                <Select
                  value={venueId !== null ? String(venueId) : undefined}
                  onValueChange={v => {
                    setVenueId(Number(v));
                    setCourtId(null);
                    setStartHour(null);
                  }}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select a venue" />
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
              <div className="space-y-1.5">
                <Label>Player name *</Label>
                <Input
                  className="bg-background"
                  placeholder="Juan Dela Cruz"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  maxLength={128}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact (phone / email)</Label>
                <Input
                  className="bg-background"
                  placeholder="09XX XXX XXXX"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  maxLength={64}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-muted-foreground font-normal">(for confirmation receipt)</span></Label>
                <Input
                  type="email"
                  className="bg-background"
                  placeholder="juan@example.com"
                  value={playerEmail}
                  onChange={e => setPlayerEmail(e.target.value)}
                  maxLength={128}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  className="bg-background"
                  value={playerDate}
                  min={todayStr()}
                  onChange={e => {
                    setPlayerDate(e.target.value);
                    setStartHour(null);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Court</Label>
                <Select
                  value={courtId !== null ? String(courtId) : undefined}
                  onValueChange={v => {
                    setCourtId(Number(v));
                    setStartHour(null);
                  }}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select court" />
                  </SelectTrigger>
                  <SelectContent>
                    {courts.data
                      ?.filter(c => c.status === "available")
                      .map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.courtNumber}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start time</Label>
                <Select
                  value={startHour ?? undefined}
                  onValueChange={setStartHour}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Pick a slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {(startOptions ?? []).length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No slots available</div>
                    ) : (
                      startOptions.map(h => (
                        <SelectItem key={h} value={h}>
                          {formatHour(h)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n} {n === 1 ? "hour" : "hours"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {startHour && quote.data && (
              <div className="rounded-lg border border-border bg-secondary/50 p-4 fade-in">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {formatHour(startHour)} – {formatHour(endHour!)}
                  </span>
                  <Badge variant="secondary" className="bg-background">
                    {duration} {duration === 1 ? "hr" : "hrs"}
                  </Badge>
                </div>
                <div className="mt-3 space-y-1.5 text-sm">
                  {quote.data.dayHours > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Sun className="h-3.5 w-3.5 text-day" /> Daytime ({quote.data.dayHours} hr)
                      </span>
                      <span>{formatPHP(quote.data.dayAmount)}</span>
                    </div>
                  )}
                  {quote.data.nightHours > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Moon className="h-3.5 w-3.5 text-night" /> Nighttime ({quote.data.nightHours} hr)
                      </span>
                      <span>{formatPHP(quote.data.nightAmount)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary panel */}
        <Card className="border-border bg-card sticky top-24">
          <CardContent className="p-6">
            {venue?.imageKey && (
              <img
                src={`/manus-storage/${venue.imageKey}`}
                alt={`${venue.name} venue photo`}
                className="w-full h-32 rounded-md object-cover mb-4 border border-border" />
            )}
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-accent" /> Booking summary
            </h3>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Row k="Venue" v={venue?.name ?? "—"} />
              <Row k="Court" v={courts.data?.find(c => c.id === courtId)?.courtNumber ?? "—"} />
              <Row k="Date" v={playerDate || "—"} />
              <Row k="Time" v={startHour ? `${formatHour(startHour)} – ${formatHour(endHour!)}` : "—"} />
              <Row k="Player" v={playerName || "—"} />
            </dl>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="font-medium">Estimated total</span>
                <span className="text-xl font-semibold text-primary">
                  {quote.data ? formatPHP(quote.data.total) : "—"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Daytime and nighttime rates applied per hour. Final amount confirmed at checkout.
              </p>
            </div>
            <Button
              className="w-full mt-5 press"
              size="lg"
              onClick={submit}
              disabled={priceInFlight}>
              {priceInFlight ? (
                <>
                  <Clock className="h-4 w-4 animate-spin" /> Pricing your slot…
                </>
              ) : (
                "Continue to checkout"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Map with venue info, below the booking form */}
      {venue && (
        <div className="mt-8">
          <VenueLocationMap venue={venue} />
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium text-right truncate">{v}</dd>
    </div>
  );
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

function todayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
