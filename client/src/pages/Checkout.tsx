import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatHour, formatPHP } from "@shared/rates";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Check, CreditCard, Landmark, Loader2, Moon, ReceiptText, Smartphone, Sun, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    codeId: number;
    code: string;
    discount: number;
  } | null>(null);

  const createBooking = trpc.bookings.create.useMutation();
  const startCheckout = trpc.payments.startCheckout.useMutation();

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

  const submit = async (channel: "online" | "walkin") => {
    setDraft({ channel });
    setSubmitting(true);
    // Held outside the try so a gateway failure can still send the player to
    // the booking that now holds their court, rather than stranding them on a
    // screen with no reference.
    let reference: string | undefined;
    try {
      const res = await createBooking.mutateAsync({
        venueId: draft.venueId!,
        courtId: draft.courtId!,
        playerDate: draft.playerDate!,
        startHour: draft.startHour!,
        endHour: draft.endHour!,
        playerName: draft.playerName!,
        contact: draft.contact ?? undefined,
        playerEmail: draft.playerEmail ?? undefined,
        channel,
        paymentMethod,
        promoCodeId: appliedPromo?.codeId ?? null,
      });
      reference = res.reference;

      // Cash changes hands at the front desk and a walk-in is settled there,
      // so neither has anything to pay through PayMongo.
      if (channel === "online" && paymentMethod !== "cash") {
        const { checkoutUrl } = await startCheckout.mutateAsync({ reference });
        // The hosted page replaces this one, so the button stays disabled
        // rather than inviting a second booking during the redirect.
        window.location.href = checkoutUrl;
        return;
      }

      toast.success("Booking confirmed");
      navigate(`/confirmation/${reference}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
      if (reference) navigate(`/confirmation/${reference}`);
    }
  };

  // ── Promo code validation ────────────────────────────────────────────────
  const promoCheck = trpc.bookings.applyPromoCode.useQuery(
    {
      venueId: draft.venueId!,
      code: promoCode.trim().toUpperCase(),
      amount: Number(draft.total ?? 0),
    },
    {
      enabled: promoCode.trim().length >= 3 && promoCode.trim().toUpperCase() !== appliedPromo?.code,
      refetchOnWindowFocus: false,
    },
  );
  const promoDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [checkingCode, setCheckingCode] = useState("");
  const [lastCheckValid, setLastCheckValid] = useState<boolean | null>(null);
  const [lastCheckReason, setLastCheckReason] = useState<string | null>(null);
  const [lastCheckDiscount, setLastCheckDiscount] = useState(0);

  useEffect(() => {
    const code = promoCode.trim().toUpperCase();
    if (code === appliedPromo?.code) return;
    if (code.length < 3) {
      setCheckingCode("");
      setLastCheckValid(null);
      setLastCheckReason(null);
      return;
    }
    clearTimeout(promoDebounce.current);
    promoDebounce.current = setTimeout(() => setCheckingCode(code), 500);
    return () => clearTimeout(promoDebounce.current);
  }, [promoCode, appliedPromo?.code]);

  useEffect(() => {
    if (!checkingCode) return;
    if (promoCheck.data) {
      setLastCheckValid(promoCheck.data.valid);
      setLastCheckReason(promoCheck.data.reason);
      setLastCheckDiscount(promoCheck.data.discount);
    }
  }, [promoCheck.data, checkingCode]);

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    if (!code || !promoCheck.data) return;
    if (!promoCheck.data.valid) {
      toast.error(promoCheck.data.reason ?? "This promo code is not valid");
      return;
    }
    // Resolve the applied code's database id via promoLookup so the booking is
    // linked to the promo code row (usage counting, reports).
    setAppliedPromo({ codeId: 0, code, discount: promoCheck.data.discount });
    toast.success(
      `Promo ${code} applied — ₱${promoCheck.data.discount.toFixed(2)} off${draft.playerEmail ? ". Receipt email will be sent." : ""}`,
    );
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoCode("");
    setLastCheckValid(null);
    setLastCheckReason(null);
  };

  // Resolve the applied promo's id through a dedicated lookup so the backend
  // can link the booking to the promo code row (for usage counting).
  const promoLookup = trpc.bookings.promoCodeId.useQuery(
    { venueId: draft.venueId!, code: appliedPromo?.code ?? "" },
    { enabled: appliedPromo != null && !appliedPromo.codeId },
  );
  useEffect(() => {
    if (appliedPromo && promoLookup.data?.id) {
      setAppliedPromo(prev => (prev ? { ...prev, codeId: promoLookup.data.id } : prev));
    }
  }, [promoLookup.data?.id, appliedPromo]);

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
                  {submitting
                    ? "Confirming…"
                    : paymentMethod === "cash"
                      ? "Confirm online booking"
                      : "Pay now"}
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
              {draft.playerEmail && <Row k="Email receipt" v={draft.playerEmail} />}
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
              {/* Promo code */}
              <div className="pt-2 border-t border-border">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Promo code
                </h4>
                {appliedPromo ? (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                    <Tag className="h-3.5 w-3.5 text-primary" />
                    <span className="flex-1 text-sm font-mono font-semibold">{appliedPromo.code}</span>
                    <span className="text-xs text-success font-semibold">−{formatPHP(appliedPromo.discount)}</span>
                    <button
                      type="button"
                      aria-label="Remove promo code"
                      onClick={removePromo}
                      className="rounded-full p-0.5 text-muted-foreground hover:text-destructive transition-colors duration-150">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-primary/40"
                      placeholder="Enter code, e.g. SUMMERDUNK"
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value)}
                    />
                    <Button
                      size="icon"
                      className="press shrink-0"
                      disabled={checkingCode.length > 0 || !promoCheck.data || !promoCheck.data.valid}
                      onClick={applyPromo}
                      aria-label="Apply promo code">
                      {checkingCode.length > 0 || promoCheck.isFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
                {lastCheckValid === false && lastCheckReason && (
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-destructive">
                    <X className="mt-px h-3 w-3 shrink-0" /> {lastCheckReason}
                  </p>
                )}
                {lastCheckValid === true && !appliedPromo && (
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-success">
                    <BadgeCheck className="mt-px h-3 w-3 shrink-0" /> Valid — {formatPHP(lastCheckDiscount)} off. Tap the check to apply.
                  </p>
                )}
              </div>
              {appliedPromo && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Sun className="h-4 w-4 text-transparent" /> Discount
                  </span>
                  <span className="font-medium text-success">−{formatPHP(appliedPromo.discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Label className="text-base font-semibold">Total</Label>
                <span className="text-2xl font-bold text-primary">
                  {appliedPromo
                    ? formatPHP(Math.max(0, Number(draft.total ?? 0) - appliedPromo.discount))
                    : formatPHP(draft.total ?? 0)}
                </span>
              </div>
              {appliedPromo && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">Before promo</span>
                  <span className="text-xs text-muted-foreground line-through">
                    {formatPHP(draft.total ?? 0)}
                  </span>
                </div>
              )}
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
