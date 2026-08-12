import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatHour, formatPHP } from "@shared/rates";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, CreditCard, Landmark, Moon, ReceiptText, Smartphone, Sun } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useBooking } from "@/contexts/BookingContext";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: Landmark },
  { value: "gcash", label: "GCash", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
];

export default function Checkout() {
  const [, navigate] = useLocation();
  const { draft, setDraft } = useBooking();
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  const createBooking = trpc.bookings.create.useMutation({
    onSuccess: res => {
      toast.success("Booking confirmed");
      navigate(`/confirmation/${res.reference}`);
    },
    onError: err => {
      toast.error(err.message || "Something went wrong");
    },
    onSettled: () => setSubmitting(false),
  });

  if (!draft.venueId || !draft.courtId || !draft.playerDate || !draft.startHour) {
    return (
      <div className="container py-20 fade-in">
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

  const submit = (channel: "online" | "walkin") => {
    setDraft({ channel });
    setSubmitting(true);
    createBooking.mutate({
      venueId: draft.venueId!,
      courtId: draft.courtId!,
      playerDate: draft.playerDate!,
      startHour: draft.startHour!,
      endHour: draft.endHour!,
      playerName: draft.playerName!,
      contact: draft.contact ?? undefined,
      channel,
      paymentMethod,
    });
  };

  return (
    <div className="container py-10 md:py-14 fade-in">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Checkout</p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
          Confirm your booking
        </h1>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px] items-start">
        {/* Payment & channel */}
        <div className="space-y-5">
          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <h3 className="font-display text-lg font-semibold">Payment method</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose how this booking will be paid. Online bookings are confirmed on payment.
              </p>
              <RadioGroup
                value={paymentMethod}
                onValueChange={setPaymentMethod}
                className="mt-4 grid sm:grid-cols-3 gap-3">
                {PAYMENT_METHODS.map(m => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-2.5 rounded-lg border p-3.5 cursor-pointer transition-all duration-150 press ${
                      paymentMethod === m.value
                        ? "border-primary bg-secondary/70 shadow-sm"
                        : "border-border hover:border-primary/40"
                    }`}>
                    <RadioGroupItem value={m.value} className="sr-only" />
                    <m.icon className="h-4.5 w-4.5 text-accent" />
                    <span className="text-sm font-medium">{m.label}</span>
                    {paymentMethod === m.value && (
                      <BadgeCheck className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <h3 className="font-display text-lg font-semibold">Booking channel</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Walk-in transactions are paid immediately at the front desk. Online bookings
                reserve the slot pending payment.
              </p>
              <div className="mt-4 flex gap-3">
                <Button
                  className="press flex-1"
                  onClick={() => submit("online")}
                  disabled={submitting}>
                  {submitting ? "Confirming…" : "Confirm online booking"}
                </Button>
                <Button
                  variant="secondary"
                  className="press flex-1"
                  onClick={() => submit("walkin")}
                  disabled={submitting}>
                  {submitting ? "Processing…" : "Walk-in payment"}
                </Button>
              </div>
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
                <Label className="text-base font-semibold">Total</Label>
                <span className="text-2xl font-bold text-primary">
                  {formatPHP(draft.total ?? 0)}
                </span>
              </div>
            </div>

            <Badge variant="outline" className="mt-4 w-full justify-center py-1.5">
              Payment: {PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label}
            </Badge>
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
