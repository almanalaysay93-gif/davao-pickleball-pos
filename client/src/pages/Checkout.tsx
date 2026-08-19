import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatHour, formatPHP } from "@shared/rates";
import { CreditCard, Moon, QrCode, ReceiptText, ShieldCheck, Smartphone, Sun } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useBooking } from "@/contexts/BookingContext";

/**
 * What the player may pay with. This list is a description of PayMongo's
 * hosted page, not a choice made here: the method is picked there, because the
 * fee passed on to the payer depends on it and only PayMongo can work it out.
 */
const ACCEPTED_METHODS = [
  { label: "GCash", icon: Smartphone },
  { label: "QR Ph", icon: QrCode },
  { label: "Card", icon: CreditCard },
];

export default function Checkout() {
  const [, navigate] = useLocation();
  const { draft, setDraft } = useBooking();
  const [submitting, setSubmitting] = useState(false);

  const createBooking = trpc.bookings.create.useMutation();
  const startCheckout = trpc.payments.startCheckout.useMutation();

  if (!draft.venueId || !draft.courtId || !draft.playerDate || !draft.startHour) {
    return (
      <div className="container mx-auto py-20 fade-in">
        <Card className="border-border max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <ReceiptText className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="mt-4 font-display text-xl font-semibold">No booking in progress</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start by selecting a venue, court, and time slot.
            </p>
            <Button className="mt-5 press" onClick={() => navigate("/book")}>
              Book a court
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /**
   * Reserve the court, then hand the player to PayMongo.
   *
   * The booking is created first and on purpose. It is what holds the court
   * while they pay, and it is what PayMongo's metadata points back at. If the
   * gateway then refuses, the reservation still stands and the confirmation
   * page offers the payment again, so a failure here costs the player a click
   * rather than their slot.
   */
  const payNow = async () => {
    setDraft({ channel: "online" });
    setSubmitting(true);
    let reference: string;
    try {
      const res = await createBooking.mutateAsync({
        venueId: draft.venueId!,
        courtId: draft.courtId!,
        playerDate: draft.playerDate!,
        startHour: draft.startHour!,
        endHour: draft.endHour!,
        playerName: draft.playerName!,
        contact: draft.contact ?? undefined,
        channel: "online",
      });
      reference = res.reference;
    } catch (err) {
      toast.error((err as Error).message || "Could not reserve the court");
      setSubmitting(false);
      return;
    }

    try {
      const { checkoutUrl } = await startCheckout.mutateAsync({ reference });
      // A full page navigation, not a router push. The payment page belongs to
      // PayMongo and the player has to see its address to trust it.
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error(
        `${(err as Error).message || "Could not open the payment page"}. Your court is held; you can pay from the receipt.`,
      );
      setSubmitting(false);
      navigate(`/confirmation/${reference}`);
    }
  };

  return (
    <div className="container mx-auto py-10 md:py-14 fade-in">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Checkout</p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
          Confirm your booking
        </h1>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px] items-start">
        <div className="space-y-5">
          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <h3 className="font-display text-lg font-semibold">Pay online</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                You will finish on PayMongo's secure page and come straight back here. Choose your
                payment method there.
              </p>
              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                {ACCEPTED_METHODS.map(m => (
                  <div
                    key={m.label}
                    className="flex items-center gap-2.5 rounded-lg border border-border p-3.5">
                    <m.icon className="h-4.5 w-4.5 text-accent" />
                    <span className="text-sm font-medium">{m.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                Your court is held for 20 minutes from now. A small payment fee is added on
                PayMongo's page, and the exact amount depends on the method you pick.
              </p>
              <Button className="press mt-5 w-full" onClick={payNow} disabled={submitting}>
                {submitting ? "Opening secure payment…" : "Pay now"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Itemized summary */}
        <Card className="border-border bg-card lg:sticky lg:top-24">
          <CardContent className="p-6">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-accent" /> Itemized summary
            </h3>

            <dl className="mt-4 space-y-2 text-sm">
              <Row k="Venue" v={draft.venueName ?? "—"} />
              <Row k="Court" v={draft.courtNumber ?? "—"} />
              <Row k="Date" v={draft.playerDate ?? "—"} />
              <Row
                k="Time"
                v={
                  draft.startHour && draft.endHour
                    ? `${formatHour(draft.startHour)} – ${formatHour(draft.endHour)}`
                    : "—"
                }
              />
              <Row k="Player" v={draft.playerName ?? "—"} />
            </dl>

            <div className="mt-5 pt-4 border-t border-border space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Rate breakdown
              </h4>
              {(draft.dayAmount ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Sun className="h-4 w-4 text-day" /> Daytime hours
                  </span>
                  <span className="font-medium">{formatPHP(draft.dayAmount ?? 0)}</span>
                </div>
              )}
              {(draft.nightAmount ?? 0) > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Moon className="h-4 w-4 text-night" /> Nighttime hours
                  </span>
                  <span className="font-medium">{formatPHP(draft.nightAmount ?? 0)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Label className="text-base font-semibold">Court total</Label>
                <span className="text-2xl font-bold text-primary">
                  {formatPHP(draft.total ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
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
