/**
 * Shared rate-calculation utilities for day/night pricing tiers.
 *
 * Daytime and nighttime are treated as DISTINCT rate tiers. A booking that
 * spans the tier boundary is split: hours before the boundary are charged at
 * the daytime rate, hours after at the nighttime rate.
 */

export type RateTier = {
  id: number;
  venueId: number;
  tierName: "daytime" | "nighttime";
  startHour: string; // "HH:MM"
  endHour: string; // "HH:MM" — may be "24:00" for midnight close
  pricePerHour: string | number;
};

/** Convert "HH:MM" to minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Convert minutes since midnight to "HH:MM". */
export function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Compute the price for a single hourly slot (startHour..endHour) at a venue
 * by splitting across day/night tiers.
 * Returns { dayHours, nightHours, dayAmount, nightAmount, total } in PHP.
 */
export function priceSlot(
  startHour: string,
  endHour: string,
  tiers: RateTier[],
): { dayHours: number; nightHours: number; dayAmount: number; nightAmount: number; total: number } {
  const start = toMinutes(startHour);
  const end = toMinutes(endHour);
  if (end <= start) {
    throw new Error("End hour must be after start hour");
  }

  // Collect tier segments covering [start, end).
  let dayMin = 0;
  let nightMin = 0;
  let dayPrice = 0;
  let nightPrice = 0;

  for (const t of tiers) {
    const tStart = toMinutes(t.startHour);
    const tEnd = toMinutes(t.endHour);
    if (tEnd <= tStart) continue;
    const segStart = Math.max(start, tStart);
    const segEnd = Math.min(end, tEnd);
    if (segEnd <= segStart) continue;
    const mins = segEnd - segStart;
    const price = Number(t.pricePerHour) / 60; // per-minute rate
    if (t.tierName === "daytime") {
      dayMin += mins;
      dayPrice += mins * price;
    } else {
      nightMin += mins;
      nightPrice += mins * price;
    }
  }

  const total = Math.round((dayPrice + nightPrice) * 100) / 100;
  return {
    dayHours: Math.round((dayMin / 60) * 100) / 100,
    nightHours: Math.round((nightMin / 60) * 100) / 100,
    dayAmount: Math.round(dayPrice * 100) / 100,
    nightAmount: Math.round(nightPrice * 100) / 100,
    total,
  };
}

/**
 * Given a venue's operating hours and its rate tiers, generate all bookable
 * hourly slot start times for a date.
 */
export function generateSlots(openTime: string, closeTime: string): string[] {
  const start = toMinutes(openTime);
  const end = toMinutes(closeTime) === 0 ? 24 * 60 : toMinutes(closeTime);
  const slots: string[] = [];
  for (let t = start; t + 60 <= end; t += 60) {
    slots.push(toHHMM(t));
  }
  return slots;
}

/** Format PHP currency like ₱1,250.00 */
export function formatPHP(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format "HH:MM" to "6:00 AM" style. */
export function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Format date "YYYY-MM-DD" to e.g. "Tue, Aug 12, 2026". */
export function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}
