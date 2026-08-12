import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { formatPHP, formatHour, formatDate } from "@shared/rates";
import { startLogin } from "@/const";
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  Link2,
  MapPin,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function MyBookings() {
  const { user, isAuthenticated, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const utils = trpc.useUtils();

  const searchReady = searched.length >= 3;
  const { data, isLoading, error } = trpc.bookings.myBookings.useQuery(
    { identifier: searched },
    { enabled: isAuthenticated && searchReady },
  );

  const cancelMutation = trpc.bookings.cancelMine.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      utils.bookings.myBookings.invalidate({ identifier: searched });
    },
    onError: e => toast.error(e.message),
  });

  if (loading) {
    return (
      <section className="container py-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-6 h-32" />
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="container max-w-2xl py-20">
        <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
          <UserRound className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Sign in to view your bookings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Players sign in with their account, then search bookings made under their name or
            contact number.
          </p>
          <Button className="mt-6" onClick={() => startLogin()}>
            Sign In
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="container max-w-4xl py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
        Player Portal
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        My Bookings
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Find your reservations by the phone number or name you booked with.
      </p>

      <div className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Phone, name, or email used at booking…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setSearched(query)} disabled={query.length < 3}>
          Search
        </Button>
      </div>
      {query.length > 0 && query.length < 3 && (
        <p className="mt-2 text-xs text-muted-foreground">Type at least 3 characters to search.</p>
      )}

      {!searchReady && (
        <Card className="mt-8 bg-card/60">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Link2 className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              Enter your phone number or name to load your reservations.
            </p>
          </CardContent>
        </Card>
      )}

      {searchReady && isLoading && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {searchReady && error && (
        <Card className="mt-8 bg-destructive/5">
          <CardContent className="py-10 text-center text-sm text-destructive">
            Could not load bookings: {error.message}
          </CardContent>
        </Card>
      )}

      {searchReady && !isLoading && !error && (data ?? []).length === 0 && (
        <Card className="mt-8 bg-card/60">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/60" />
            <p className="font-medium">No reservations found</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              No active bookings match “{searched}”. Book a court to get started.
            </p>
            <Link href="/book">
              <Button className="mt-2">Book a Court</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {searchReady && !isLoading && !error && (data ?? []).length > 0 && (
        <div className="mt-8 space-y-4">
          {(data ?? []).map(({ booking, venue }: any) => (
            <Card key={booking.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-5 py-2.5">
                <span className="font-mono text-xs font-semibold tracking-wider text-primary">
                  {booking.reference}
                </span>
                <Badge
                  variant={booking.paymentStatus === "paid" ? "default" : "secondary"}
                  className={
                    booking.paymentStatus === "paid"
                      ? "bg-emerald-600 text-white hover:bg-emerald-600"
                      : ""
                  }>
                  {booking.paymentStatus === "paid" ? (
                    <BadgeCheck className="mr-1 h-3 w-3" />
                  ) : null}
                  {booking.paymentStatus === "paid" ? "Confirmed & paid" : "Pending payment"}
                </Badge>
              </div>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <h3 className="font-display text-lg font-semibold">{venue?.name ?? "Venue"}</h3>
                  {venue ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {venue.address}
                    </p>
                  ) : null}
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDate(booking.playerDate)} ·{" "}
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />{" "}
                    {formatHour(booking.startHour)} – {formatHour(booking.endHour)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {booking.playerName}
                    {booking.contact ? ` · ${booking.contact}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-display text-xl font-semibold">
                    {formatPHP(Number(booking.totalAmount))}
                  </span>
                  {booking.paymentStatus !== "cancelled" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Cancelling frees the court for other players. This cannot be undone —
                            the slot becomes available immediately.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              cancelMutation.mutate({
                                id: booking.id,
                                identifier: searched,
                              })
                            }>
                            Yes, cancel
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
