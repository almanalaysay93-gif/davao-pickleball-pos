import { AlertTriangle, Megaphone } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * Player-facing announcement banner(s). Fetches active, non-expired announcements
 * from the owner portal and displays them prominently. Optionally scoped to a
 * single venue (used on Courts/Book/Schedule venue views) or global (Home).
 */
export function AnnouncementsBanner({ venueId }: { venueId?: number }) {
  const { data: anns, isLoading } = trpc.announcements.list.useQuery(
    venueId ? { venueId } : undefined,
    { refetchInterval: 15000 },
  );

  const visible = (anns ?? []).filter(a => a.active === 1);
  if (isLoading || visible.length === 0) return null;

  return (
    <div className="fade-in space-y-2">
      {visible.map(a => (
        <div
          key={a.id}
          className="flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span>{a.title}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{a.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lightweight count badge showing there are live notices (for nav/header usage). */
export function useAnnouncementCount(venueId?: number) {
  const { data } = trpc.announcements.list.useQuery(
    venueId ? { venueId } : undefined,
    { refetchInterval: 15000 },
  );
  return (data ?? []).filter(a => a.active === 1).length;
}

export { Megaphone };
