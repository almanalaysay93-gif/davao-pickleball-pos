import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { startLogin } from "@/const";
import { formatHour, formatPHP } from "@shared/rates";
import {
  BadgeCheck,
  BadgeX,
  CalendarDays,
  KeyRound,
  Loader2,
  MapPin,
  Megaphone,
  ReceiptText,
  Trash2,
  UserPlus,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Owner() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="container py-24 flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-24 text-center fade-in">
        <Card className="max-w-sm mx-auto border-border">
          <CardContent className="p-8">
            <KeyRound className="h-9 w-9 text-muted-foreground mx-auto" />
            <h2 className="mt-4 font-display text-xl font-semibold">Owner sign-in required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to manage your venue's courts, rates, and reservations.
            </p>
            <Button className="mt-5 w-full press" onClick={() => startLogin()}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user.role !== "owner") {
    return (
      <div className="container py-24 text-center fade-in">
        <Card className="max-w-sm mx-auto border-border">
          <CardContent className="p-8">
            <BadgeX className="h-9 w-9 text-destructive mx-auto" />
            <h2 className="mt-4 font-display text-xl font-semibold">Venue owner access only</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account is not yet registered as a venue owner. The system administrator can
              assign venue ownership to your registered email — just reach out with your venue
              name and account email.
            </p>
            <Button variant="outline" className="mt-5 w-full press" onClick={() => startLogin()}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <OwnerDashboard />;
}

function OwnerDashboard() {
  const utils = trpc.useUtils();
  const venues = trpc.owner.myVenues.useQuery(undefined, {
    refetchOnWindowFocus: true,
    select: (data: any) => data as { id: number; name: string; address: string }[],
  });
  const bookings = trpc.owner.bookings.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    select: (data: any) =>
      data as {
        booking: {
          id: number;
          venueId: number;
          courtId: number;
          reference: string;
          playerDate: string;
          startHour: string;
          endHour: string;
          playerName: string;
          channel: string;
          totalAmount: string;
          paymentStatus: string;
        };
        venue: { id: number; name: string; address: string } | null;
      }[],
  });

  const markPaid = trpc.owner.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Booking marked as paid");
      utils.owner.bookings.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const cancel = trpc.owner.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      utils.owner.bookings.invalidate();
      utils.availability.forVenueDate.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const rows = bookings.data ?? [];
    return rows.reduce(
      (acc, { booking }) => {
        if (booking.paymentStatus === "paid") {
          acc.paid += 1;
          acc.revenue += Number(booking.totalAmount);
        }
        if (booking.paymentStatus === "pending") acc.pending += 1;
        return acc;
      },
      { paid: 0, pending: 0, revenue: 0 },
    );
  }, [bookings.data]);

  if (venues.isLoading) {
    return (
      <div className="container py-24 flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!venues.data?.length) {
    return (
      <div className="container py-24 text-center fade-in">
        <Card className="max-w-sm mx-auto border-border">
          <CardContent className="p-8">
            <KeyRound className="h-9 w-9 text-muted-foreground mx-auto" />
            <h2 className="mt-4 font-display text-xl font-semibold">No venues assigned</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You haven't been assigned any venue yet. Contact the system administrator to assign
              one of the Davao City venues to your account.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-10 md:py-14 fade-in">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          Owner portal
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">My Venues</h1>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
        <StatCard label="Owned venues" value={venues.data.length} accent="text-primary" />
        <StatCard label="Paid bookings" value={stats.paid} accent="text-success" />
        <StatCard label="Pending payment" value={stats.pending} accent="text-warning" />
        <StatCard label="Revenue (paid)" value={formatPHP(stats.revenue)} accent="text-primary" />
      </div>

      {/* Owned venues */}
      <div className="mt-10">
        <h2 className="font-display text-xl font-semibold">Your venues</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.data.map(v => (
            <VenuePanel key={v.id} venueId={v.id} />
          ))}
        </div>
      </div>

      {/* Bookings across owned venues */}
      <Card className="mt-10 border-border bg-card">
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-accent" /> Reservations across your venues
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {(bookings.data ?? []).length} records
              </span>
              <OwnerBookDialog />
              <OwnerWalkInDialog />
            </div>
          </div>

          {bookings.isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !bookings.data?.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No reservations yet at your venue(s).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Court</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(bookings.data ?? []).map(({ booking, venue }) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {booking.reference}
                      </TableCell>
                      <TableCell>{venue?.name ?? `#${booking.venueId}`}</TableCell>
                      <TableCell>Court {booking.courtId}</TableCell>
                      <TableCell>{booking.playerDate}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatHour(booking.startHour)} – {formatHour(booking.endHour)}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-36 truncate">{booking.playerName}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={booking.channel === "walkin" ? "secondary" : "outline"} className="text-[10px]">
                          {booking.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatPHP(Number(booking.totalAmount))}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={booking.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {booking.paymentStatus === "pending" && (
                            <PayDialog
                              bookingId={booking.id}
                              onDone={() => markPaid.mutate({ id: booking.id })}
                            />
                          )}
                          {booking.paymentStatus !== "cancelled" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 press text-destructive bg-transparent hover:bg-destructive/10"
                              title="Cancel booking"
                              onClick={() => cancel.mutate({ id: booking.id })}>
                              <BadgeX className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OwnerBookDialog() {
  const utils = trpc.useUtils();
  const { data: myVenues } = trpc.owner.myVenues.useQuery(undefined, { refetchOnWindowFocus: false });
  const [open, setOpen] = useState(false);
  const [venueId, setVenueId] = useState<number | null>(myVenues?.[0]?.id ?? null);
  const courtsQuery = trpc.owner.courtsForVenue.useQuery(
    { venueId: venueId ?? 0 },
    { enabled: venueId !== null, refetchOnWindowFocus: false },
  );
  const [courtId, setCourtId] = useState<number | null>(null);
  const [playerDate, setPlayerDate] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  });
  const [startHour, setStartHour] = useState("");
  const [endHour, setEndHour] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [contact, setContact] = useState("");

  const quote = trpc.bookings.quote.useQuery(
    { venueId: venueId ?? 0, courtId: courtId ?? 0, playerDate, startHour, endHour, playerName: "x" },
    {
      enabled: Boolean(venueId && courtId && startHour && endHour && playerDate && /^\d{2}:\d{2}$/.test(startHour) && /^\d{2}:\d{2}$/.test(endHour)),
      refetchOnWindowFocus: false,
    },
  );

  const create = trpc.owner.createBooking.useMutation({
    onSuccess: res => {
      toast.success("Your court is booked");
      utils.owner.bookings.invalidate();
      utils.availability.forVenueDate.invalidate();
      setOpen(false);
      window.location.href = `/confirmation/${res.reference}`;
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!playerName.trim() || venueId === null || !courtId || !playerDate || !startHour || !endHour) {
      toast.error("Please complete all required fields");
      return;
    }
    if (/^\d{2}:\d{2}$/.test(startHour) && /^\d{2}:\d{2}$/.test(endHour) && endHour <= startHour) {
      toast.error("End time must be later than start time");
      return;
    }
    create.mutate({
      venueId,
      courtId,
      playerDate,
      startHour,
      endHour,
      playerName: playerName.trim(),
      contact: contact.trim() || undefined,
      channel: "online",
      paymentMethod: undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="press bg-transparent">
          <CalendarDays className="h-4 w-4 mr-1.5" /> Book a court
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Book a court at your venue</DialogTitle>
          <DialogDescription>
            Reserve a court for yourself or your staff through the same booking flow as
            players — it appears in your reservations and blocks the slot for everyone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {myVenues && myVenues.length > 1 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Venue *</Label>
              <Select
                value={venueId !== null ? String(venueId) : undefined}
                onValueChange={v => {
                  setVenueId(Number(v));
                  setCourtId(null);
                }}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {myVenues.map(v => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Court *</Label>
            <Select value={courtId !== null ? String(courtId) : undefined} onValueChange={v => setCourtId(Number(v))}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select court" />
              </SelectTrigger>
              <SelectContent>
                {(courtsQuery.data as any[])
                  ?.filter((c: { status: string }) => c.status === "available")
                  .map((c: { id: number; courtNumber: string }) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.courtNumber}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" className="bg-background" value={playerDate} min={playerDate} onChange={e => setPlayerDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Start time *</Label>
            <Input className="bg-background" placeholder="18:00" value={startHour} onChange={e => setStartHour(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End time *</Label>
            <Input className="bg-background" placeholder="20:00" value={endHour} onChange={e => setEndHour(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Player name *</Label>
            <Input className="bg-background" placeholder="Juan Dela Cruz" value={playerName} onChange={e => setPlayerName(e.target.value)} maxLength={128} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input className="bg-background" placeholder="09XX XXX XXXX" value={contact} onChange={e => setContact(e.target.value)} maxLength={64} />
          </div>
          <div className="sm:col-span-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
            <span className="font-semibold">Estimated total: </span>
            {quote.data ? (
              <span className="font-semibold text-primary">{formatPHP(quote.data.total)}</span>
            ) : (
              <span className="text-muted-foreground">Enter times to see the day/night rate breakdown</span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="press" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OwnerWalkInDialog() {
  const utils = trpc.useUtils();
  const { data: myVenues } = trpc.owner.myVenues.useQuery(undefined, { refetchOnWindowFocus: false });
  const [open, setOpen] = useState(false);
  const [venueId, setVenueId] = useState<number | null>(myVenues?.[0]?.id ?? null);
  const courtsQuery = trpc.owner.courtsForVenue.useQuery(
    { venueId: venueId ?? 0 },
    { enabled: venueId !== null, refetchOnWindowFocus: false },
  );
  const [courtId, setCourtId] = useState<number | null>(null);
  const [playerDate, setPlayerDate] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  });
  const [startHour, setStartHour] = useState("");
  const [endHour, setEndHour] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [contact, setContact] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const create = trpc.bookings.create.useMutation({
    onSuccess: res => {
      toast.success("Walk-in booking created");
      utils.owner.bookings.invalidate();
      utils.availability.forVenueDate.invalidate();
      setOpen(false);
      window.location.href = `/confirmation/${res.reference}`;
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!playerName.trim() || venueId === null || !courtId || !playerDate || !startHour || !endHour) {
      toast.error("Please complete all required fields");
      return;
    }
    create.mutate({
      venueId,
      courtId,
      playerDate,
      startHour,
      endHour,
      playerName: playerName.trim(),
      contact: contact.trim() || undefined,
      channel: "walkin",
      paymentMethod,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="press">
          <UserPlus className="h-4 w-4 mr-1.5" /> New walk-in booking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Walk-in booking &amp; payment</DialogTitle>
          <DialogDescription>
            Create a booking and process payment on the spot at your venue's front desk.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {myVenues && myVenues.length > 1 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Venue *</Label>
              <Select
                value={venueId !== null ? String(venueId) : undefined}
                onValueChange={v => {
                  setVenueId(Number(v));
                  setCourtId(null);
                }}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {myVenues.map(v => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Court *</Label>
            <Select value={courtId !== null ? String(courtId) : undefined} onValueChange={v => setCourtId(Number(v))}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select court" />
              </SelectTrigger>
              <SelectContent>
                {(courtsQuery.data as any[])
                  ?.filter((c: { status: string }) => c.status === "available")
                  .map((c: { id: number; courtNumber: string }) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.courtNumber}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" className="bg-background" value={playerDate} min={playerDate} onChange={e => setPlayerDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Start time *</Label>
            <Input className="bg-background" placeholder="18:00" value={startHour} onChange={e => setStartHour(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End time *</Label>
            <Input className="bg-background" placeholder="20:00" value={endHour} onChange={e => setEndHour(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Player name *</Label>
            <Input className="bg-background" placeholder="Juan Dela Cruz" value={playerName} onChange={e => setPlayerName(e.target.value)} maxLength={128} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Contact</Label>
            <Input className="bg-background" placeholder="09XX XXX XXXX" value={contact} onChange={e => setContact(e.target.value)} maxLength={64} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="press" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Processing…" : "Create & charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementsSection({ venueId }: { venueId: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expireAt, setExpireAt] = useState("");

  const anns = trpc.owner.announcements.useQuery(
    { venueId },
    { refetchOnWindowFocus: false },
  );

  const create = trpc.owner.createAnnouncement.useMutation({
    onSuccess: () => {
      toast.success("Announcement posted");
      utils.owner.announcements.invalidate({ venueId });
      utils.announcements.list.invalidate();
      setOpen(false);
      setTitle("");
      setMessage("");
      setExpireAt("");
    },
    onError: e => toast.error(e.message),
  });
  const toggle = trpc.owner.updateAnnouncement.useMutation({
    onSuccess: () => {
      utils.owner.announcements.invalidate({ venueId });
      utils.announcements.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.owner.deleteAnnouncement.useMutation({
    onSuccess: () => {
      toast.success("Announcement deleted");
      utils.owner.announcements.invalidate({ venueId });
      utils.announcements.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Megaphone className="h-3 w-3" /> Announcements
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="press bg-transparent text-xs">
              <Megaphone className="h-3.5 w-3.5 mr-1" /> Post notice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Post a venue announcement</DialogTitle>
              <DialogDescription>
                Players will see this notice on the venue pages — e.g. court closures for a
                party or special events.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label className="block">
                <span className="mb-1.5 block text-sm font-medium">Title *</span>
                <Input
                  className="bg-background"
                  placeholder="Courts closed today — private event"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={160}
                />
              </Label>
              <Label className="block">
                <span className="mb-1.5 block text-sm font-medium">Details *</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Tell players what's happening and until when…"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
              </Label>
              <Label className="block">
                <span className="mb-1.5 block text-sm font-medium">Expire (optional)</span>
                <Input
                  type="datetime-local"
                  className="bg-background"
                  value={expireAt}
                  onChange={e => setExpireAt(e.target.value)}
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Leave empty to keep the notice visible indefinitely.
                </span>
              </Label>
            </div>
            <DialogFooter>
              <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                className="press"
                disabled={create.isPending || !title.trim() || !message.trim()}
                onClick={() =>
                  create.mutate({
                    venueId,
                    title: title.trim(),
                    message: message.trim(),
                    expireAt: expireAt ? new Date(expireAt).toISOString() : null,
                  })
                }>
                {create.isPending ? "Posting…" : "Post announcement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-2 space-y-2">
        {anns.data?.length ? (
          anns.data.map(a => (
            <div key={a.id} className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{a.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{a.message}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={a.active === 1 ? "secondary" : "outline"} className="text-[9px]">
                    {a.active === 1 ? "Live" : "Hidden"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 press bg-transparent"
                    title={a.active === 1 ? "Hide announcement" : "Show announcement"}
                    onClick={() =>
                      toggle.mutate({ id: a.id, active: a.active === 1 ? 0 : 1 })
                    }>
                    <Megaphone className={`h-3.5 w-3.5 ${a.active === 1 ? "text-success" : "text-muted-foreground"}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 press bg-transparent text-destructive"
                    title="Delete announcement"
                    onClick={() => remove.mutate({ id: a.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          !anns.isLoading && (
            <p className="text-[11px] text-muted-foreground">No announcements yet.</p>
          )
        )}
        {anns.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className={`mt-1.5 text-2xl font-bold ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <Badge className="bg-success/15 text-success border-0">Paid</Badge>;
  if (status === "cancelled")
    return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
  return <Badge className="bg-warning/20 text-warning-foreground border-0">Pending</Badge>;
}

function VenuePanel({ venueId }: { venueId: number }) {
  const utils = trpc.useUtils();
  const [courtVenueId, setCourtVenueId] = useState(venueId);
  const [rateVenueId, setRateVenueId] = useState(venueId);

  const venue = trpc.owner.myVenues.useQuery(undefined, {
    refetchOnWindowFocus: false,
    select: (data: any) => data.find((v: any) => v.id === venueId),
  });
  const courts = trpc.owner.courtsForVenue.useQuery(
    { venueId: courtVenueId },
    { enabled: courtVenueId === venueId, refetchOnWindowFocus: false },
  );
  const tiers = trpc.owner.ratesForVenue.useQuery(
    { venueId: rateVenueId },
    { enabled: rateVenueId === venueId, refetchOnWindowFocus: false },
  );

  const setCourtStatus = trpc.owner.setCourtStatus.useMutation({
    onSuccess: () => {
      toast.success("Court status updated");
      utils.owner.courtsForVenue.invalidate({ venueId });
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="border-border bg-card flex flex-col">
      <CardContent className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold leading-snug">
              {venue.data?.name ?? `Venue #${venueId}`}
            </h3>
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground max-w-60">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {venue.data?.address}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Owner
          </span>
        </div>

        {/* Courts */}
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Wrench className="h-3 w-3" /> Courts
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {courts.data?.map(c => (
              <Button
                key={c.id}
                variant="outline"
                size="sm"
                className={`press bg-transparent text-xs ${
                  c.status === "maintenance"
                    ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                    : "border-success/40 text-success hover:bg-success/10"
                }`}
                onClick={() =>
                  setCourtStatus.mutate({
                    courtId: c.id,
                    status: c.status === "available" ? "maintenance" : "available",
                  })
                }>
                {c.courtNumber}
                {c.status === "maintenance" ? " · down" : " · up"}
              </Button>
            ))}
            {courts.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Rates */}
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <CalendarDays className="h-3 w-3" /> Rate tiers (per hour)
          </p>
          <div className="mt-2 space-y-2">
            {tiers.data?.map(t => (
              <RateRow key={t.id} tierId={t.id} />
            ))}
            {tiers.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Announcements */}
        <AnnouncementsSection venueId={venueId} />
      </CardContent>
    </Card>
  );
}

function RateRow({ tierId }: { tierId: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");

  // We can't fetch a single tier directly; read all tiers via the public router
  // and locate ours once (rates rarely change, so this is fine).
  const allTiers = trpc.rates.all.useQuery(undefined, {
    refetchOnWindowFocus: false,
    select: data => data.find(t => t.id === tierId),
  });
  const tier = allTiers.data;

  const update = trpc.owner.updateRateTier.useMutation({
    onSuccess: () => {
      toast.success("Rate updated");
      utils.owner.ratesForVenue.invalidate();
      utils.rates.all.invalidate();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div>
        <span className="text-xs font-semibold capitalize">{tier?.tierName}</span>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {formatHour(tier?.startHour ?? "")} – {formatHour(tier?.endHour ?? "")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{formatPHP(Number(tier?.pricePerHour ?? 0))}/hr</span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs press" onClick={() => setOpen(true)}>
          Edit
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogFooter>
            <Label className="w-full">
              <span className="mb-1.5 block text-sm font-medium">Hourly price ({tier?.tierName})</span>
              <Input
                className="bg-background"
                placeholder="300.00"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </Label>
            <Button
              variant="outline"
              className="press bg-transparent"
              onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="press"
              disabled={update.isPending || !/^\d+(\.\d{1,2})?$/.test(price)}
              onClick={() => update.mutate({ tierId, pricePerHour: price })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayDialog({ bookingId, onDone }: { bookingId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("cash");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 press bg-transparent hover:bg-success/10 hover:text-success" title="Mark as paid">
          <BadgeCheck className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <div className="space-y-1.5">
          <Label>Payment method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="gcash">GCash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="press"
            onClick={() => {
              onDone();
              setOpen(false);
            }}>
            Confirm paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
