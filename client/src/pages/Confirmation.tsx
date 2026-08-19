import { Button } from "@/components/ui/button";
import { formatHour, formatPHP } from "@shared/rates";
import { BadgeCheck, CalendarDays, CircleAlert, CircleDollarSign, Clock, CreditCard, Hourglass, MapPin, Printer } from "lucide-react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { PlayerStatusBadge } from "@/components/BookingStatus";
import { useBooking } from "@/contexts/BookingContext";
import { VenueLocation } from "@/components/VenueLocation";
import { useEffect, useRef, useState } from "react";

export default function Confirmation() {
  const [, params] = useRoute("/confirmation/:reference");
  const reference = params?.reference ?? "";
  const { resetDraft } = useBooking();

  const { data, isLoading, error, refetch } = trpc.bookings.get.useQuery(
    { reference },
    { enabled: Boolean(reference), refetchOnWindowFocus: false },
  );

  /**
   * This page is also where PayMongo returns the player, so it has to answer
   * "did my payment go through" without believing the browser that asks.
   *
   * sync makes the server retrieve the session from PayMongo and settle from
   * what the gateway says. The webhook is the reliable path and normally wins
   * the race; this covers the player who gets back first, and the day the
   * webhook does not arrive at all.
   */
  const sync = trpc.payments.sync.useMutation();
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.booking.paymentStatus !== "pending") return;
    if (!data.booking.paymongoSessionId) return;
    if (synced.current === reference) return;
    synced.current = reference;
    sync.mutateAsync({ reference }).then(
      res => {
        if (res.paymentStatus === "paid") refetch();
      },
      () => {
        // A gateway that will not answer is not the player's problem to solve
        // on this screen. The receipt still shows the real, unpaid state and
        // the pay button below is still there.
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.booking.id, data?.booking.paymentStatus]);

  const [paying, setPaying] = useState(false);
  const startCheckout = trpc.payments.startCheckout.useMutation();
  const payNow = async () => {
    setPaying(true);
    try {
      const { checkoutUrl } = await startCheckout.mutateAsync({ reference });
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error((err as Error).message || "Could not open the payment page");
      setPaying(false);
    }
  };

  // Three states, not two. A pending booking holds its court but nobody has
  // paid for it, and the player who abandoned PayMongo's page lands right
  // here. Telling them the reservation is secured sends them to the venue with
  // a receipt the venue will not honour.
  const status = data?.booking.paymentStatus;
  const holdsCourt = status === undefined || status === "paid" || status === "pending";
  const awaitingPayment = status === "pending";

  // Clear the booking draft once confirmed — the transaction is done.
  useEffect(() => {
    if (data) resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.booking.id]);

  if (error) {
    return (
      <div className="container mx-auto py-20 text-center fade-in">
        <p className="text-muted-foreground">Booking not found: {reference}</p>
        <Link href="/">
          <Button className="mt-4 press">Return home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-12 md:py-16 fade-in">
      <div className="max-w-md mx-auto">
        {/* Wording follows the status. A booking whose hold lapsed no longer
            holds its court, and telling the player it is secured sends them to
            a venue that has already resold the slot. */}
        <div className="text-center">
          <span
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              !holdsCourt ? "bg-destructive/10" : awaitingPayment ? "bg-warning/15" : "bg-success/15"
            }`}>
            {!holdsCourt ? (
              <CircleAlert className="h-9 w-9 text-destructive" />
            ) : awaitingPayment ? (
              <Hourglass className="h-9 w-9 text-warning" />
            ) : (
              <BadgeCheck className="h-9 w-9 text-success" />
            )}
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold text-balance">
            {!holdsCourt
              ? "This booking is no longer held"
              : awaitingPayment
                ? "Your court is held, awaiting payment"
                : "Booking confirmed"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {!holdsCourt
              ? "The court has been released and this receipt is not valid for entry. Book again to reserve a slot."
              : awaitingPayment
                ? "Nobody has paid for this slot yet. Complete payment to secure it, or the court is released."
                : "Your reservation is secured. Present this receipt at the venue."}
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
                <PlayerStatusBadge status={data.booking.paymentStatus} />
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
                  {/* The player lands here straight off PayMongo, often still
                      unpaid. Calling an unpaid total 'Amount paid' tells them
                      the venue has their money when it does not. */}
                  <span className="font-semibold">
                    {data.booking.paymentStatus === "paid" ? "Amount paid" : "Amount due"}
                  </span>
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

            {data.booking.paymentStatus === "pending" && (
              <div className="px-6 pb-1">
                <Button className="press w-full" onClick={payNow} disabled={paying || sync.isPending}>
                  <CreditCard className="mr-1.5 h-4 w-4" />
                  {sync.isPending
                    ? "Checking your payment…"
                    : paying
                      ? "Opening secure payment…"
                      : "Pay now"}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  This court is held for a short time only. It is released if payment does not
                  arrive.
                </p>
              </div>
            )}

            <div className="px-6 pb-6 pt-5 flex gap-2">
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
                <VenueLocation venue={data.venue} />
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
