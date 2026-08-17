import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquareQuote } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** Star-rating picker shared with the review form. */
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i + 1} star${i > 0 ? "s" : ""}`}
          className="press p-0.5"
          onClick={() => onChange(i + 1)}>
          <Star
            className={`h-8 w-8 transition-transform duration-150 ${i < value ? "fill-amber-400 text-amber-400 scale-100" : "text-muted-foreground/30 scale-90"}`}
            style={i < value ? { transform: "scale(1)" } : undefined}
          />
        </button>
      ))}
    </div>
  );
}

/** Customer review form: name, stars, comment, optional booking reference. */
export function ReviewForm({ venueId, bookingRef }: { venueId: number; bookingRef?: string }) {
  const utils = trpc.useUtils();
  const [playerName, setPlayerName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [refInput, setRefInput] = useState(bookingRef ?? "");

  const create = trpc.reviews.create.useMutation({
    onSuccess: () => {
      toast.success("Thanks! Your review has been posted.");
      setPlayerName("");
      setComment("");
      setRating(5);
      if (!bookingRef) setRefInput("");
      utils.reviews.list.invalidate({ venueId });
      utils.reviews.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return toast.error("Please enter your name");
    if (!comment.trim()) return toast.error("Please write a short comment");
    create.mutate({
      venueId,
      playerName: playerName.trim(),
      rating,
      comment: comment.trim(),
      bookingRef: refInput.trim() || undefined,
    });
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquareQuote className="h-5 w-5 text-accent" /> Leave a review
        </CardTitle>
        <CardDescription>
          Tell other players about your visit — your review shows up live for the venue owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Your rating</Label>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <div className="space-y-1.5">
            <Label>Your name *</Label>
            <Input
              className="bg-background"
              placeholder="e.g. Juan dela Cruz"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={64}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Your comment *</Label>
            <Textarea
              className="bg-background min-h-24"
              placeholder="How was the court, the facilities, the staff…?"
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={1000}
            />
          </div>
          {!bookingRef && (
            <div className="space-y-1.5">
              <Label>Booking reference <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                className="bg-background"
                placeholder="e.g. DV-PB-8A3K"
                value={refInput}
                onChange={e => setRefInput(e.target.value)}
                maxLength={32}
              />
              <p className="text-xs text-muted-foreground">
                Add your booking reference so your review is marked as a verified visit.
              </p>
            </div>
          )}
          <Button type="submit" className="press" disabled={create.isPending}>
            {create.isPending ? "Posting…" : "Post review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Read-only review list for a venue (customers can also browse). */
export function VenueReviews({ venueId }: { venueId: number }) {
  const reviews = trpc.reviews.list.useQuery({ venueId }, { refetchOnWindowFocus: false });
  const stats = trpc.reviews.stats.useQuery({ venueId }, { refetchOnWindowFocus: false });

  const rows = reviews.data ?? [];
  const statsRow = stats.data as { average: number; count: number } | undefined;

  if (!rows.length) return null;

  return (
    <div className="mt-6">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2">
        Player reviews
        {statsRow && statsRow.count > 0 && (
          <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            {statsRow.average.toFixed(1)} · {statsRow.count} review{statsRow.count === 1 ? "" : "s"}
          </span>
        )}
      </h3>
      <div className="mt-3 space-y-2.5">
        {rows.slice(0, 10).map(r => (
          <div key={r.id} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{r.playerName}</span>
              <span className="flex items-center gap-0.5 text-amber-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-3 w-3 ${i < r.rating ? "fill-current" : "opacity-25"}`} />
                ))}
              </span>
              {r.bookingRef && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/70 border border-primary/20 rounded px-1.5 py-0.5">
                  Verified
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-foreground/85">{r.comment}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
