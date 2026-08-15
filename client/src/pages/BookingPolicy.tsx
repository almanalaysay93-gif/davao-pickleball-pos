import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Coins,
  HandCoins,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import CustomerLayout from "../components/CustomerLayout";
import { usePageMeta } from "@/lib/meta";

/**
 * Booking Policy — transparency page.
 * The single biggest public complaint about the competitor (PickleHub) in
 * Davao is that *confirmed* bookings get displaced by tournaments with only
 * refund-or-credit remedies. This page states our policy up front, builds
 * trust, and turns a competitor weakness into ours.
 */
export default function BookingPolicy() {
  usePageMeta({
    title: "Booking Policy — Davao Pickleball POS",
    description:
      "Clear rules for bookings, cancellations, refunds, and rescheduling at every pickleball court in Davao City.",
  });

  return (
    <CustomerLayout>
      <div className="container py-8 max-w-3xl fade-in">
        <h1 className="font-display text-3xl font-bold tracking-tight">Booking Policy</h1>
        <p className="mt-2 text-muted-foreground leading-relaxed">
          Clear rules for booking, cancelling, rescheduling, and refunds — so you always
          know where you stand before you pay.
        </p>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-xl font-semibold font-display">
            <ShieldCheck className="h-5 w-5 text-primary" /> Confirmed bookings are honored
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Once your booking is confirmed and paid, the court is yours. Venues that use
            this platform commit to honoring confirmed reservations. A venue may only
            cancel a confirmed booking for documented reasons such as court maintenance,
            safety hazards, or city-mandated closures.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold font-display">
            <HandCoins className="h-5 w-5 text-primary" /> Refunds and compensation
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            If a venue cancels your confirmed booking, you are entitled to a full refund
            of the amount paid — not credit, not a future-discount promise. The refund is
            processed the same way you paid. Where a venue cancels close to your reserved
            time, a courtesy credit toward a future booking may additionally be offered at
            the venue's discretion.
          </p>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Private tournaments or events organized by a venue do <strong>not</strong>
            override already-confirmed individual bookings. Venues must keep open slots
            available for tournament play instead.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold font-display">
            <CalendarClock className="h-5 w-5 text-primary" /> Rescheduling
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            You can reschedule a booking free of charge up to 2 hours before your slot
            starts, as long as your new time is available. Visit{" "}
            <Link href="/my-bookings" className="text-primary underline underline-offset-2">
              My Bookings
            </Link>{" "}
            and use the reschedule option next to your reservation. Rescheduling less than
            2 hours before the slot is at the venue's discretion — call the venue or
            message them through the platform.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold font-display">
            <AlertTriangle className="h-5 w-5 text-primary" /> Player-initiated cancellations
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Cancel your booking at least 2 hours before the slot and receive a full
            refund. Cancellations within 2 hours of the slot may be refunded as venue
            credit, depending on the venue. No-shows are not refunded.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold font-display">
            <Coins className="h-5 w-5 text-primary" /> Payments
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Rates are displayed per hour (day rate and night rate) at checkout before you
            confirm. Payment is collected according to the venue's chosen method (cash on
            arrival, or digital payment where supported). Your booking is only confirmed
            once payment is settled or pre-authorized by the venue.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold font-display">
            <BadgeCheck className="h-5 w-5 text-primary" /> Venue responsibility
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Venues on this platform are expected to keep their schedules, rates, and
            announcements accurate. An inaccurate availability display that causes a
            player to lose a slot is treated the same as a venue cancellation: full
            refund or a free reschedule to the next available time, whichever you prefer.
          </p>
        </section>

        <div className="mt-10 rounded-lg border border-border bg-card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold">Need help with a booking?</p>
            <p className="text-sm text-muted-foreground mt-1">
              View or manage your reservations, or contact a venue directly about any
              issue.
            </p>
          </div>
          <Link href="/my-bookings">
            <Button>My Bookings</Button>
          </Link>
        </div>
      </div>
    </CustomerLayout>
  );
}
