import { AlertTriangle, CalendarDays, Copy, Facebook, Megaphone, MessageCircle, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

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

  const [dismissed, setDismissed] = useState<Set<number>>(() => {
    try {
      return new Set(
        JSON.parse(window.localStorage.getItem("dismissed-announcements") ?? "[]"),
      );
    } catch {
      return new Set<number>();
    }
  });

  const visible = (anns ?? []).filter(a => a.active === 1 && !dismissed.has(a.id));
  const plainNotices = visible.filter(a => !a.photoUrl && a.kind !== "event");
  const photoPromos = visible.filter(a => a.photoUrl && a.kind === "promotion");
  const events = visible.filter(a => a.kind === "event");
  if (isLoading || visible.length === 0) return null;

  const dismiss = (id: number) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      try {
        window.localStorage.setItem(
          "dismissed-announcements",
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // storage unavailable — still hide for this session
      }
      return next;
    });
  };

  return (
    <div className="fade-in space-y-2">
      {/* Photo promo cards (promotions with images) */}
      {photoPromos.map(a => (
        <PromoCard key={a.id} a={a} onDismiss={() => dismiss(a.id)} />
      ))}

      {/* Event pins */}
      {events.map(a => (
        <div
          key={a.id}
          className="flex items-start gap-2.5 rounded-lg border border-accent/50 bg-accent/10 px-4 py-3">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
                {a.eventDate}
              </span>
              {a.photoUrl && (
                <img src={a.photoUrl} alt={a.title} className="h-14 w-14 rounded-md object-cover border border-border" />
              )}
              <span className="flex-1">{a.title}</span>
              <button
                type="button"
                aria-label="Dismiss event notice"
                onClick={() => dismiss(a.id)}
                className="ml-auto rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors duration-150">
                <X className="h-3.5 w-3.5" />
              </button>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{a.message}</p>
          </div>
        </div>
      ))}

      {/* Plain notices */}
      {plainNotices.map(a => (
        <div
          key={a.id}
          className="flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span>{a.title}</span>
              <button
                type="button"
                aria-label="Dismiss announcement"
                onClick={() => dismiss(a.id)}
                className="ml-auto rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-warning/20 transition-colors duration-150">
                <X className="h-3.5 w-3.5" />
              </button>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{a.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Featured promo card with photo and social share buttons. */
function PromoCard({ a, onDismiss }: { a: { id: number; title: string; message: string; photoUrl: string | null }; onDismiss: () => void }) {
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const text = `${a.title} — ${a.message}`;
  const onShare = (url: string) => {
    void navigator.clipboard?.writeText(`${text} ${shareUrl}`);
    toast.success("Link copied — paste it anywhere to share");
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {a.photoUrl && (
        <div className="relative">
          <img src={a.photoUrl} alt={a.title} className="h-40 w-full object-cover" />
          <button
            type="button"
            aria-label="Dismiss promotion"
            onClick={onDismiss}
            className="absolute top-1.5 right-1.5 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-colors duration-150">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="px-4 py-3">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Promo</span>
          {a.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{a.message}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Share</span>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on WhatsApp"
            className="rounded-md border border-border p-1.5 text-[#25D366] hover:bg-muted transition-colors duration-150">
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on Facebook"
            className="rounded-md border border-border p-1.5 text-[#1877F2] hover:bg-muted transition-colors duration-150">
            <Facebook className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            aria-label="Copy link"
            onClick={() => onShare("copy")}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
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
