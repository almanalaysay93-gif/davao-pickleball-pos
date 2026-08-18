import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquareQuote, MessageSquareReply, Reply as ReplyIcon, Star, Trash2 } from "lucide-react";
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

type ReplyRow = {
  id: number;
  reviewId: number;
  ownerId: number;
  body: string;
  createdAt: string | number | Date;
};

/** Live feed of player reviews for the signed-in owner's venue(s). */
export function OwnerReviewsFeed({ venueIds }: { venueIds: number[] }) {
  const reviews = trpc.owner.reviews.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    select: (data: any) => data as { rows: ReviewRow[]; stats: { average: number; count: number } | null },
  });
  const replies = trpc.owner.replies.useQuery(
    venueIds.length === 1 ? { venueId: venueIds[0] } : undefined,
    { enabled: venueIds.length > 0, select: (data: any) => data as { rows: ReviewRow[]; replies: ReplyRow[] } },
  );
  const utils = trpc.useUtils();
  const [replyFor, setReplyFor] = useState<ReviewRow | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const createReply = trpc.owner.createReply.useMutation({
    onSuccess: () => {
      toast.success("Reply posted — players will see it publicly");
      setReplyFor(null);
      void utils.owner.replies.invalidate();
      void utils.owner.reviews.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const deleteReply = trpc.owner.deleteReply.useMutation({
    onSuccess: () => {
      toast.success("Reply removed");
      void utils.owner.replies.invalidate();
      void utils.owner.reviews.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const existingReply = (reviewId: number) => replies.data?.replies.find(r => r.reviewId === reviewId);
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
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
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
                      {!existingReply(r.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 text-xs text-muted-foreground hover:text-primary ml-auto"
                          onClick={() => { setReplyFor(r); setReplyBody(""); }}>
                          <MessageSquareReply className="h-3.5 w-3.5" /> Reply
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground/85">{r.comment}</p>
                    {existingReply(r.id) && (
                      <div className="mt-2 rounded-lg bg-accent/50 border border-accent px-3 py-2 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-accent-foreground">
                          <ReplyIcon className="h-3.5 w-3.5" /> Owner replied
                          <span className="ml-auto text-muted-foreground">
                            {new Date(existingReply(r.id)!.createdAt as string).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                          </span>
                        </div>
                        <p className="mt-1 text-foreground/85">{existingReply(r.id)!.body}</p>
                        <div className="mt-1.5 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (!confirm("Remove your reply to this review?")) return;
                              deleteReply.mutate({ reviewId: r.id });
                            }}>
                            <Trash2 className="h-3 w-3" /> Remove reply
                          </Button>
                        </div>
                      </div>
                    )}
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

      {/* Reply dialog */}
      <Dialog open={!!replyFor} onOpenChange={open => !open && setReplyFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reply to {replyFor?.playerName}</DialogTitle>
            <DialogDescription>
              Your reply is shown publicly under the review, addressing the player for all future visitors.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder="Thanks for playing with us! …"
            maxLength={1000}
            className="min-h-28"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyFor(null)}>Cancel</Button>
            <Button
              disabled={createReply.isPending || replyBody.trim().length === 0}
              onClick={() => createReply.mutate({ reviewId: replyFor!.id, body: replyBody.trim() })}>
              {createReply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Post reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
