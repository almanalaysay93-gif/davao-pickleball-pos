import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatHour, formatPHP } from "@shared/rates";
import { BadgeCheck, CalendarDays, CircleDollarSign, Clock, Copy, Facebook, MapPin, MessageCircle, Printer, Tag } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePageMeta } from "@/lib/meta";
import { useBooking } from "@/contexts/BookingContext";
import { VenueLocationMap, VenueGalleryHero } from "@/components/VenueLocation";
import { ReviewForm, VenueReviews } from "@/components/ReviewForm";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function Confirmation() {
  const [, params] = useRoute("/confirmation/:reference");
  const reference = params?.reference ?? "";
  const { resetDraft } = useBooking();

  usePageMeta({
    title: "Booking Confirmed — Davao Pickleball POS",
    description: "Your pickleball court reservation in Davao City has been confirmed. See your booking details and directions.",
  });

  const { data, isLoading, error } = trpc.bookings.get.useQuery(
    { reference },
    { enabled: Boolean(reference), refetchOnWindowFocus: false },
  );

  // ── Settling the payment ─────────────────────────────────────────────────
  // PayMongo sends the player back here the moment they finish paying, which
  // is usually before the webhook lands and occasionally instead of it. Asking
  // the gateway directly is what closes that window.
  const utils = trpc.useUtils();
  const [released, setReleased] = useState(false);
  const asked = useRef(false);
  const cancelled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("cancelled") === "1";

  const sync = trpc.payments.sync.useMutation({
    onSuccess: res => {
      // Money arrived for a court the booking had already released. The server
      // refuses to force it back to paid, so the player is told the truth and
      // the venue settles it by hand.
      if (res.paidButReleased) {
        setReleased(true);
        return;
      }
      if (res.paymentStatus !== data?.booking.paymentStatus) {
        utils.bookings.get.invalidate({ reference });
      }
    },
  });

  const startCheckout = trpc.payments.startCheckout.useMutation({
    onSuccess: res => {
      window.location.href = res.checkoutUrl;
    },
    onError: err => toast.error(err.message || "Could not open the payment page"),
  });

  useEffect(() => {
    if (!data || asked.current) return;
    if (data.booking.paymentStatus !== "pending") return;
    // Once per arrival. A repeated sync would ask the gateway the same
    // question and answer it the same way.
    asked.current = true;
    sync.mutate({ reference });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.booking.paymentStatus]);

  const pending = data?.booking.paymentStatus === "pending";
  const settling = sync.isPending;

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
          <span
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              pending ? "bg-warning/15" : "bg-success/15"
            }`}>
            {pending ? (
              <Clock className="h-9 w-9 text-warning" />
            ) : (
              <BadgeCheck className="h-9 w-9 text-success" />
            )}
          </span>
          <h1 className="mt-5 font-display text-3xl font-semibold text-balance">
            {pending ? "Court held, awaiting payment" : "Booking confirmed"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {settling
              ? "Checking with PayMongo…"
              : pending
                ? cancelled
                  ? "You left the payment page. Your court is still held for a short while — pay now to keep it."
                  : "Your court is held until payment is received. Pay now to confirm it."
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
                <MapPin className="h-3.5 w-3.5" /> {data.venue?.address}
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
                {Number(data.booking.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-success font-medium pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" /> Promo discount
                    </span>
                    <span>−{formatPHP(Number(data.booking.discountAmount))}</span>
                  </div>
                )}
              </div>
            </div>

            {released && (
              <div className="mx-6 mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p className="font-semibold text-destructive">Payment received after the hold lapsed</p>
                <p className="mt-1 text-muted-foreground">
                  PayMongo confirms your payment, but this court was released before it
                  arrived and may now be held by somebody else. The venue has been notified
                  and will refund or rebook you. Quote reference {reference}.
                </p>
              </div>
            )}

            {pending && !released && (
              <div className="px-6 pb-4">
                <Button
                  className="w-full press"
                  disabled={startCheckout.isPending || settling}
                  onClick={() => startCheckout.mutate({ reference })}>
                  {startCheckout.isPending
                    ? "Opening PayMongo…"
                    : `Pay ${formatPHP(Number(data.booking.totalAmount))}`}
                </Button>
              </div>
            )}

            <div className="px-6 pb-4 flex gap-2">
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
            {(Number(data.booking.discountAmount ?? 0) > 0) && (
              <div className="px-6 pb-6">
                <ShareButtons booking={data.booking} reference={reference} />
              </div>
            )}
            {data.venue && (
              <div className="px-6 pb-6">
                <VenueLocationMap venue={data.venue} />
              </div>
            )}
          </div>
        ) : null}

        {/* Player reviews: see what others say, and leave your own */}
        {data?.venue && (
          <div className="mt-6 max-w-md mx-auto">
            <VenueReviews venueId={data.venue.id} />
            <div className="mt-6">
              <ReviewForm venueId={data.venue.id} bookingRef={reference} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShareButtons({ booking, reference }: { booking: { venueName?: string | null; playerDate?: string | null; startHour?: string | null; endHour?: string | null; totalAmount?: string | number; discountAmount?: string | number; paymentStatus?: string | null }; reference: string }) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const discount = Number(booking.discountAmount ?? 0);
  const text = [
    "Davao Pickleball POS — Booking confirmed",
    `Reference: ${reference}`,
    `Venue: ${booking.venueName ?? "—"}`,
    booking.playerDate ? `Date: ${booking.playerDate}` : null,
    booking.startHour && booking.endHour
      ? `Time: ${formatHour(booking.startHour)} – ${formatHour(booking.endHour)}`
      : null,
    discount > 0 ? `Promo discount: −${formatPHP(discount)}` : null,
    `Total: ${formatPHP(Number(booking.totalAmount ?? 0))}`,
    `Status: ${booking.paymentStatus === "paid" ? "Paid" : "Payment pending"}`,
  ]
    .filter(Boolean)
    .join("\n");
  const copyLink = async () => {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast.success("Receipt link copied — paste it anywhere to share");
  };
  return (
    <div className="border-t border-dashed border-border pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Share your receipt
      </p>
      <div className="flex gap-1.5">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on WhatsApp"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-[#25D366] hover:bg-muted transition-colors duration-150">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Facebook"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-[#1877F2] hover:bg-muted transition-colors duration-150">
          <Facebook className="h-3.5 w-3.5" /> Facebook
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150">
          <Copy className="h-3.5 w-3.5" /> Copy link
        </button>
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
