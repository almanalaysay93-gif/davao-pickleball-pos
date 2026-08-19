import { Badge } from "@/components/ui/badge";
import { BadgeCheck } from "lucide-react";
import type { Booking } from "@shared/types";

export type BookingStatus = Booking["paymentStatus"];

/**
 * How each payment status is worded and coloured.
 *
 * This is a Record keyed on the status union rather than a chain of ifs, so
 * adding a status to the schema breaks the build here instead of falling
 * through to whatever the last branch happened to be. That fall-through is
 * what let 'expired' render as 'Pending' on every screen at once.
 */
const PRESENTATION: Record<BookingStatus, { label: string; playerLabel: string; className: string }> = {
  paid: {
    label: "Paid",
    playerLabel: "Confirmed & paid",
    className: "bg-success/15 text-success border-0",
  },
  pending: {
    label: "Pending",
    playerLabel: "Pending payment",
    className: "bg-warning/20 text-warning-foreground border-0",
  },
  cancelled: {
    label: "Cancelled",
    playerLabel: "Cancelled",
    className: "bg-muted text-muted-foreground border-0",
  },
  // A lapsed hold has released the court, so the wording must not suggest the
  // player can still pay for it.
  expired: {
    label: "Expired",
    playerLabel: "Expired - not paid in time",
    className: "bg-destructive/10 text-destructive border-0",
  },
};

export function statusLabel(status: BookingStatus, audience: "staff" | "player" = "staff") {
  return audience === "player" ? PRESENTATION[status].playerLabel : PRESENTATION[status].label;
}

/** Status badge for the staff-facing tables in the admin and owner portals. */
export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, className } = PRESENTATION[status];
  return <Badge className={className}>{label}</Badge>;
}

/** Status badge for the screens a player sees, which word the states for them. */
export function PlayerStatusBadge({ status, className = "" }: { status: BookingStatus; className?: string }) {
  const presentation = PRESENTATION[status];
  return (
    <Badge className={`${presentation.className} ${className}`.trim()}>
      {status === "paid" ? <BadgeCheck className="mr-1 h-3 w-3" /> : null}
      {presentation.playerLabel}
    </Badge>
  );
}
