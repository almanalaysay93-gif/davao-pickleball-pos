import { Badge } from "@/components/ui/badge";
import { formatHour, formatPHP, type RateTier } from "@shared/rates";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type GridCourt = {
  id: number;
  courtNumber: string;
  occupied: string[];
  down: boolean;
};

type Props = {
  slots: string[];
  courts: GridCourt[];
  tiers: RateTier[];
  selected: { courtId: number | null; hour: string | null };
  onSelect: (courtId: number, hour: string) => void;
  /** If true, occupied slots can still be clicked to view details (read-only preview) */
  interactive?: boolean;
};

/**
 * Hourly availability grid: rows = courts, columns = hourly slots.
 * Daytime vs nighttime tier styling is baked into the column headers.
 */
export default function AvailabilityGrid({ slots, courts, tiers, selected, onSelect, interactive = true }: Props) {
  const tierAt = (hour: string): "daytime" | "nighttime" | null => {
    const mins = toMin(hour);
    for (const t of tiers) {
      const s = toMin(t.startHour);
      const e = t.endHour === "24:00" ? 24 * 60 : toMin(t.endHour);
      if (mins >= s && mins < e) return t.tierName;
    }
    return null;
  };

  const priceAt = (hour: string) => {
    const tier = tierAt(hour);
    const t = tiers.find(x => x.tierName === tier);
    return t ? formatPHP(Number(t.pricePerHour)) : "—";
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm border-collapse min-w-[720px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card text-left p-3 font-medium w-32 border-b border-r border-border">
              Court
            </th>
            {slots.map(h => {
              const tier = tierAt(h);
              return (
                <th
                  key={h}
                  className={cn(
                    "p-2 text-center border-b border-border text-[11px] leading-tight min-w-16",
                    tier === "daytime" ? "bg-day/15" : "bg-night/10",
                  )}>
                  <div className={cn("font-semibold", tier === "daytime" ? "text-accent-foreground" : "text-foreground")}>
                    {formatHour(h)}
                  </div>
                  <div className="flex items-center justify-center gap-0.5 text-muted-foreground mt-0.5">
                    {tier === "daytime" ? (
                      <Sun className="h-3 w-3" />
                    ) : (
                      <Moon className="h-3 w-3" />
                    )}
                    {priceAt(h)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {courts.map((c, rowIdx) => (
            <tr key={c.id} className={rowIdx % 2 === 1 ? "bg-muted/30" : undefined}>
              <td className="sticky left-0 z-10 bg-card p-2.5 border-r border-border">
                <div className="font-medium">{c.courtNumber}</div>
                {c.down && <Badge variant="destructive" className="mt-1 text-[10px]">Maintenance</Badge>}
              </td>
              {slots.map(h => {
                const occ = c.occupied.includes(h);
                const isSel = selected.courtId === c.id && selected.hour === h;
                const tier = tierAt(h);
                return (
                  <td key={h} className="p-1 border-border/50">
                    <button
                      type="button"
                      disabled={c.down || (occ && !interactive)}
                      onClick={() => !c.down && onSelect(c.id, h)}
                      className={cn(
                        "slot-cell w-full h-8 rounded-md text-[11px] font-medium border",
                        c.down
                          ? "bg-muted text-muted-foreground border-dashed border-border cursor-not-allowed"
                          : occ
                            ? "bg-accent/20 border-accent/40 text-accent-foreground cursor-pointer"
                            : isSel
                              ? "bg-primary text-primary-foreground border-primary shadow-sm cursor-pointer"
                              : tier === "daytime"
                                ? "bg-day/10 border-border/60 text-foreground/70 hover:border-primary/50 hover:bg-day/25 cursor-pointer"
                                : "bg-night/5 border-border/60 text-foreground/70 hover:border-primary/50 hover:bg-night/15 cursor-pointer",
                      )}
                      aria-label={`${c.courtNumber} ${formatHour(h)} ${occ ? "occupied" : "available"}`}>
                      {occ ? "Booked" : c.down ? "—" : "Open"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2.5 border-t border-border flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-day/25 border border-border/60" /> Daytime slot</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-night/15 border border-border/60" /> Nighttime slot</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-accent/25 border border-accent/40" /> Booked</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border border-dashed border-border" /> Maintenance</span>
      </div>
    </div>
  );
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
