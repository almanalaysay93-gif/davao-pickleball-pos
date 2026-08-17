import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, MessageSquareQuote, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ReviewRow = {
  id: number;
  venueId: number;
  playerName: string;
  playerEmail: string | null;
  rating: number;
  comment: string;
  bookingRef: number | null;
  createdAt: string | number | Date;
};

/** Live feed of player reviews for the signed-in owner's venue(s). */
export function OwnerReviewsFeed({ venueIds }: { venueIds: number[] }) {
  const reviews = trpc.owner.reviews.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    select: (data: any) => data as { rows: ReviewRow[]; stats: { average: number; count: number } | null },
  });
  const stats = trpc.reviews.stats.useQuery(undefined, {
    refetchOnWindowFocus: false,
    select: (data: any) => data as Record<number, { average: number; count: number }>,
  });

  const rows = reviews.data?.rows ?? [];
  const allStats = (stats.data as Record<number, { average: number; count: number }>) ?? {};

  return (
    <div className="mt-10">
      <h2 className="font-display text-xl font-semibold flex items-center gap-2">
        <MessageSquareQuote className="h-5 w-5 text-accent" /> Player reviews
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        New reviews appear here automatically as players submit them.
      </p>

      {/* Aggregate rating */}
      {Object.keys(allStats).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(allStats)
            .filter(([venueId]) => venueIds.includes(Number(venueId)))
            .map(([venueId, s]) => (
              <div
                key={venueId}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
                <span className="font-semibold text-amber-500">★</span>
                <span className="font-bold">{s.average.toFixed(1)}</span>
                <span className="text-muted-foreground">({s.count})</span>
              </div>
            ))}
        </div>
      )}

      {reviews.isLoading ? (
        <Card className="mt-4 border-border bg-card">
          <CardContent className="p-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : !rows.length ? (
        <Card className="mt-4 border-border bg-card">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No reviews yet — as soon as players review your venue they will show up here.
          </CardContent>
        </Card>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map(r => (
            <Card key={r.id} className="border-border bg-card stagger">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {r.playerName.trim().charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{r.playerName}</span>
                      <span className="flex items-center gap-0.5 text-amber-500" aria-label={`${r.rating} of 5 stars`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-current" : "opacity-25"}`} />
                        ))}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.bookingRef
                          ? `Verified booking #${r.bookingRef}`
                          : "Guest"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground/85">{r.comment}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {new Date(r.createdAt as string).toLocaleString("en-US", {
                        timeZone: "Asia/Manila",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
