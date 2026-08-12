import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { BadgeCheck, BadgeX, Clock, DoorOpen, Loader2, ReceiptText, Wrench, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Admin() {
  const { user, loading } = useAuth();

  if (loading) {
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
            <DoorOpen className="h-9 w-9 text-muted-foreground mx-auto" />
            <h2 className="mt-4 font-display text-xl font-semibold">Staff sign-in required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to access the booking management dashboard.
            </p>
            <Button className="mt-5 w-full press" onClick={() => startLogin()}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="container py-24 text-center fade-in">
        <Card className="max-w-sm mx-auto border-border">
          <CardContent className="p-8">
            <BadgeX className="h-9 w-9 text-destructive mx-auto" />
            <h2 className="mt-4 font-display text-xl font-semibold">Admin access only</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account does not have administrator privileges.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const utils = trpc.useUtils();
  const bookings = trpc.bookings.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });
  const venues = trpc.venues.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const markPaid = trpc.bookings.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Booking marked as paid");
      utils.bookings.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const cancel = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      utils.bookings.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const stats = (bookings.data ?? []).reduce(
    (acc, b) => {
      if (b.paymentStatus === "paid") {
        acc.paid += 1;
        acc.revenue += Number(b.totalAmount);
      }
      if (b.paymentStatus === "pending") acc.pending += 1;
      if (b.paymentStatus === "cancelled") acc.cancelled += 1;
      return acc;
    },
    { paid: 0, pending: 0, cancelled: 0, revenue: 0 },
  );

  return (
    <div className="container py-10 md:py-14 fade-in">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            Admin dashboard
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-balance">
            Booking management
          </h1>
        </div>
        <WalkInDialog />
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
        <StatCard label="Paid bookings" value={stats.paid} accent="text-success" />
        <StatCard label="Pending payment" value={stats.pending} accent="text-warning" />
        <StatCard label="Cancelled" value={stats.cancelled} accent="text-muted-foreground" />
        <StatCard label="Revenue (paid)" value={formatPHP(stats.revenue)} accent="text-primary" />
      </div>

      {/* Bookings table */}
      <Card className="mt-8 border-border bg-card">
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-accent" /> All reservations
            </h3>
            <span className="text-xs text-muted-foreground">
              {bookings.data?.length ?? 0} records
            </span>
          </div>

          {bookings.isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !bookings.data?.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No bookings yet. Use "New walk-in booking" to create the first transaction.
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
                  {bookings.data.map(b => {
                    const venue = venues.data?.find(v => v.id === b.venueId);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs font-semibold">
                          {b.reference}
                        </TableCell>
                        <TableCell>{venue?.name ?? `#${b.venueId}`}</TableCell>
                        <TableCell>Court {b.courtId}</TableCell>
                        <TableCell>{b.playerDate}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatHour(b.startHour)} – {formatHour(b.endHour)}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-36 truncate">{b.playerName}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.channel === "walkin" ? "secondary" : "outline"} className="text-[10px]">
                            {b.channel}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{formatPHP(Number(b.totalAmount))}</TableCell>
                        <TableCell>
                          <StatusBadge status={b.paymentStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {b.paymentStatus === "pending" && (
                              <PayDialog bookingId={b.id} onDone={() => markPaid.mutate({ id: b.id })} />
                            )}
                            {b.paymentStatus !== "cancelled" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 press text-destructive bg-transparent hover:bg-destructive/10"
                                title="Cancel booking"
                                onClick={() =>
                                  cancel.mutate({ id: b.id })
                                }>
                                <BadgeX className="h-4 w-4" />
                              </Button>
                            )}
                            <ModifyDialog bookingId={b.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CourtStatusCard />
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
        <DialogHeader>
          <DialogTitle>Confirm payment</DialogTitle>
          <DialogDescription>Mark this booking as paid and record the payment method.</DialogDescription>
        </DialogHeader>
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

function ModifyDialog({ bookingId }: { bookingId: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const [playerName, setPlayerName] = useState("");
  const [contact, setContact] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  // Load the full reservation list while the dialog is open so we can prefill.
  const detail = trpc.bookings.list.useQuery(undefined, { enabled: open });
  const rows = detail.data ?? [];
  const target = rows.find(r => r.id === bookingId);

  const modify = trpc.bookings.modify.useMutation({
    onSuccess: () => {
      toast.success("Booking updated");
      utils.bookings.list.invalidate();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o && target) {
          setPlayerName(target.playerName);
          setContact(target.contact ?? "");
          setNewStart(target.startHour);
          setNewEnd(target.endHour);
        }
      }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 press bg-transparent" title="Modify booking">
          <Clock className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Modify booking</DialogTitle>
          <DialogDescription>Update player details or time slot.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Player name</Label>
            <Input className="bg-background" value={playerName} onChange={e => setPlayerName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input className="bg-background" value={contact} onChange={e => setContact(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>New start</Label>
              <Input className="bg-background" placeholder="18:00" value={newStart} onChange={e => setNewStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>New end</Label>
              <Input className="bg-background" placeholder="20:00" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="press"
            disabled={modify.isPending}
            onClick={() =>
              modify.mutate({
                id: bookingId,
                playerName: playerName.trim(),
                contact: contact.trim() || undefined,
                startHour: newStart || undefined,
                endHour: newEnd || undefined,
              })
            }>
            {modify.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WalkInDialog() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const { data: venues } = trpc.venues.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const [venueId, setVenueId] = useState<number | null>(venues?.[0]?.id ?? null);
  const courtsQuery = trpc.courts.byVenue.useQuery(
    { venueId: venueId ?? 1 },
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
      utils.bookings.list.invalidate();
      utils.availability.forVenueDate.invalidate();
      setOpen(false);
      // Show the receipt screen immediately — same flow as online checkout.
      window.location.href = `/confirmation/${res.reference}`;
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!playerName.trim() || !venueId || !courtId || !playerDate || !startHour || !endHour) {
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
            Create a booking and process payment on the spot at the front desk.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
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
                {venues?.map(v => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Court *</Label>
            <Select
              value={courtId !== null ? String(courtId) : undefined}
              onValueChange={v => setCourtId(Number(v))}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select court" />
              </SelectTrigger>
              <SelectContent>
                {courtsQuery.data
                  ?.filter((c: { status: string }) => c.status === "available")
                  .map(c => (
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
          <div className="space-y-1.5 sm:col-span-2">
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

function CourtStatusCard() {
  const utils = trpc.useUtils();
  const { data: venues } = trpc.venues.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const [selectedVenue, setSelectedVenue] = useState<number | null>(venues?.[0]?.id ?? null);
  const courts = trpc.courts.byVenue.useQuery(
    { venueId: selectedVenue ?? 1 },
    { enabled: selectedVenue !== null, refetchOnWindowFocus: false },
  );

  const setStatus = trpc.bookings.setCourtStatus.useMutation({
    onSuccess: () => {
      toast.success("Court status updated");
      utils.courts.byVenue.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="mt-6 border-border bg-card">
      <CardContent className="p-6">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <Wrench className="h-5 w-5 text-accent" /> Court operational status
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Mark a court as under maintenance to hide it from bookings.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {venues?.map(v => (
            <Button
              key={v.id}
              variant={selectedVenue === v.id ? "default" : "outline"}
              size="sm"
              className={`press ${selectedVenue !== v.id ? "bg-transparent" : ""}`}
              onClick={() => setSelectedVenue(v.id)}>
              {v.name}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {courts.data?.map((c: { id: number; courtNumber: string; status: string }) => (
            <Button
              key={c.id}
              variant="outline"
              size="sm"
              className={`press bg-transparent ${
                c.status === "maintenance"
                  ? "border-destructive/40 text-destructive hover:bg-destructive/10"
                  : "border-success/40 text-success hover:bg-success/10"
              }`}
              onClick={() =>
                setStatus.mutate({
                  courtId: c.id,
                  status: c.status === "available" ? "maintenance" : "available",
                })
              }>
              {c.courtNumber}
              {c.status === "maintenance" ? " · maintenance" : " · available"}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
