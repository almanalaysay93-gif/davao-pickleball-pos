import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatHour, formatPHP } from "@shared/rates";
import { BadgeCheck, CalendarDays, CircleDollarSign, Clock, MapPin, Printer } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useBooking } from "@/contexts/BookingContext";
import { VenueLocationMap, VenueGalleryHero } from "@/components/VenueLocation";
import { useEffect } from "react";

export default function Confirmation() {
  const [, params] = useRoute("/confirmation/:reference");
  const reference = params?.reference ?? "";
  const { resetDraft } = useBooking();

  const { data, isLoading, error } = trpc.bookings.get.useQuery(
    { reference },
    { enabled: Boolean(reference), refetchOnWindowFocus: false },
  );

  // Clear the booking draft once confirmed — the transaction is done.
  useEffect(() => {
    if (data) resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.booking.id]);

  if (error) {
    return (
      <div className="container py-20 text-center fade-in">
        <p className="text-muted-foreground">Booking not found: {reference}</p>
        <Link href="/">
          <Button className="mt-4 press">Return home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container py-12 md:py-16 fade-in">
      {/* Photo gallery hero at the very top of the page */}
      {data?.venue && (
        <div className="max-w-md mx-auto -mt-3 mb-6">
          <VenueGalleryHero venue={data.venue} />
        </div>
      )}

      <div className="max-w-md mx-auto">
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
            <BadgeCheck className="h-9 w-9 text-success" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold text-balance">
            Booking confirmed
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your reservation is secured. Present this receipt at the venue.
          </p>
        </div>

        {isLoading ? (
          <div className="mt-8 h-96 rounded-xl bg-muted animate-pulse" />
        ) : data ? (
          <div className="mt-8 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            {/* Receipt header */}
            <div className="bg-primary text-primary-foreground px-6 py-5 text-center">
              <p className="text-xs uppercase tracking-[0.24em] opacity-75">Booking reference</p>
              <p className="mt-1 font-display text-2xl font-bold tracking-wide">{reference}</p>
              <div className="mt-2">
                <Badge
                  className={
                    data.booking.paymentStatus === "paid"
                      ? "bg-success/90 text-success-foreground border-0"
                      : "bg-warning/90 text-warning-foreground border-0"
                  }>
                  {data.booking.paymentStatus === "paid" ? "Paid" : "Payment pending"}
                </Badge>
              </div>
            </div>

            {/* Receipt body */}
            <div className="px-6 py-5 space-y-3.5 text-sm">
              <ReceiptRow icon={MapPin} k="Venue" v={data.venue?.name ?? "—"} />
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 pl-7">
                <MapPin className="h-3 w-3" /> {data.venue?.address}
              </p>
              <ReceiptRow icon={CalendarDays} k="Date" v={data.booking.playerDate} />
              <ReceiptRow
                icon={Clock}
                k="Time"
                v={`${formatHour(data.booking.startHour)} – ${formatHour(data.booking.endHour)}`}
              />
              <ReceiptRow icon={MapPin} k="Court" v={data.court?.courtNumber ?? "—"} />
              <ReceiptRow icon={CircleDollarSign} k="Player" v={data.booking.playerName} />

              <div className="pt-3 border-t border-dashed border-border space-y-1.5">
                {(Number(data.booking.dayAmount) > 0) && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Daytime hours</span>
                    <span>{formatPHP(Number(data.booking.dayAmount))}</span>
                  </div>
                )}
                {(Number(data.booking.nightAmount) > 0) && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Nighttime hours</span>
                    <span>{formatPHP(Number(data.booking.nightAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-border">
                  <span className="font-semibold">Amount paid</span>
                  <span className="text-lg font-bold text-primary">
                    {formatPHP(Number(data.booking.totalAmount))}
                  </span>
                </div>
                {data.booking.paymentMethod && (
                  <p className="text-xs text-muted-foreground text-right pt-1">
                    Via {data.booking.paymentMethod} ·{" "}
                    {data.booking.channel === "walkin" ? "Walk-in" : "Online"}
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <Button
                variant="outline"
                className="press flex-1 bg-transparent"
                onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1.5" /> Print receipt
              </Button>
              <Link href="/" className="flex-1">
                <Button className="w-full press">Done</Button>
              </Link>
            </div>
            {data.venue && (
              <div className="px-6 pb-6">
                <VenueLocationMap venue={data.venue} />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReceiptRow({ icon: Icon, k, v }: { icon: typeof MapPin; k: string; v: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex justify-between flex-1 gap-3">
        <span className="text-muted-foreground">{k}</span>
        <span className="font-medium truncate">{v}</span>
      </div>
    </div>
  );
}
