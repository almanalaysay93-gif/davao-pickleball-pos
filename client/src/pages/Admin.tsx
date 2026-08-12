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
import { formatHour, formatPHP, priceSlot } from "@shared/rates";
import { Link } from "wouter";
import { BadgeCheck, BadgeX, Clock, DoorOpen, Loader2, ReceiptText, Wrench, UserPlus, KeyRound, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Admin() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="container py-24 flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  const isGlobalOwner =
    (user?.type === "owner" || user?.role === "owner") &&
    (user as { venueId?: number | null } | undefined)?.venueId == null;

  if (!user || !isGlobalOwner) {
    return (
      <div className="container py-24 text-center fade-in">
        <Card className="max-w-sm mx-auto border-border">
          <CardContent className="p-8">
            <DoorOpen className="h-9 w-9 text-muted-foreground mx-auto" />
            <h2 className="mt-4 font-display text-xl font-semibold">Owner sign-in required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              System administration is part of the owner portal. Sign in with your owner
              credentials to continue.
            </p>
            <Link href="/owner-login">
              <Button className="mt-5 w-full press">Sign in</Button>
            </Link>
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
      <OwnerAccountsCard />
      <OwnershipCard />
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

  // Load the venue's rate tiers so we can validate slot times and preview pricing.
  const tiersQuery = trpc.rates.byVenue.useQuery(
    { venueId: target?.venueId ?? 1 },
    { enabled: open && Boolean(target?.venueId) },
  );
  const slots = useMemo(() => {
    const rows2 = (tiersQuery.data ?? []).map(t => ({ start: t.startHour, end: t.endHour }));
    return rows2;
  }, [tiersQuery.data]);
  const venueOpen = slots[0]?.start ?? "06:00";
  const venueClose = slots[slots.length - 1]?.end ?? "22:00";

  // Live price preview for the proposed time range.
  const pricePreview = useMemo(() => {
    const startOk = /^\d{2}:\d{2}$/.test(newStart);
    const endOk = /^\d{2}:\d{2}$/.test(newEnd);
    if (!startOk || !endOk || !(tiersQuery.data ?? []).length) return null;
    try {
      return priceSlot(newStart, newEnd, tiersQuery.data!);
    } catch {
      return null;
    }
  }, [newStart, newEnd, tiersQuery.data]);

  const startValid = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(newStart)) return "Required, HH:MM";
    if (newStart < venueOpen) return `Venue opens at ${formatHour(venueOpen)}`;
    return null;
  }, [newStart, venueOpen]);
  const endValid = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(newEnd)) return "Required, HH:MM";
    if (newEnd <= newStart) return "Must be after start time";
    if (newEnd > venueClose) return `Venue closes at ${formatHour(venueClose === "00:00" ? "24:00" : venueClose)}`;
    return null;
  }, [newEnd, newStart, venueClose]);

  const modify = trpc.bookings.modify.useMutation({
    onSuccess: () => {
      toast.success("Booking updated");
      utils.bookings.list.invalidate();
      utils.availability.forVenueDate.invalidate();
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
              {startValid && <p className="text-xs text-destructive">{startValid}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>New end</Label>
              <Input className="bg-background" placeholder="20:00" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
              {endValid && <p className="text-xs text-destructive">{endValid}</p>}
            </div>
          </div>
          {pricePreview && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="font-medium">New estimated total</p>
              <p>
                Daytime: {pricePreview.dayHours} hr × {formatPHP(pricePreview.dayAmount)} · Nighttime: {pricePreview.nightHours} hr × {formatPHP(pricePreview.nightAmount)}
              </p>
              <p className="mt-1 font-semibold text-primary">{formatPHP(pricePreview.total)}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            className="press"
            disabled={modify.isPending || Boolean(startValid || endValid) || !newStart || !newEnd}
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

function OwnershipCard() {
  const utils = trpc.useUtils();
  const venues = trpc.venues.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const owners = trpc.admin.owners.useQuery(undefined, { refetchOnWindowFocus: false });

  const [email, setEmail] = useState("");
  const [venueId, setVenueId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const grant = trpc.admin.grantOwnership.useMutation({
    onSuccess: () => {
      toast.success("Venue ownership granted — the user now sees the Owner portal");
      setEmail("");
      setOpen(false);
      utils.admin.owners.invalidate();
      utils.owner.myVenues.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="mt-6 border-border bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-accent" /> Venue owners
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Assign a signed-in user as owner of a venue so they can manage its courts, rates, and bookings.
              The owner must sign in to the app at least once before you can assign them.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="press bg-transparent">
                <UserPlus className="h-4 w-4 mr-1.5" /> Grant ownership
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Grant venue ownership</DialogTitle>
                <DialogDescription>
                  Give a signed-in user full management access to one venue.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Owner email *</Label>
                  <Input
                    className="bg-background"
                    type="email"
                    placeholder="owner@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Must match the account the owner signed in with.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Venue *</Label>
                  <Select
                    value={venueId !== null ? String(venueId) : undefined}
                    onValueChange={v => setVenueId(Number(v))}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select venue" />
                    </SelectTrigger>
                    <SelectContent>
                      {venues.data?.map(v => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="press"
                  disabled={grant.isPending || !email || venueId === null}
                  onClick={() =>
                    grant.mutate({ email: email.trim(), venueId: venueId! })
                  }>
                  {grant.isPending ? "Granting…" : "Grant ownership"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {owners.isLoading ? (
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !owners.data?.length ? (
          <p className="mt-4 text-sm text-muted-foreground">No venue owners assigned yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.data.map(row => {
                  const venue = venues.data?.find(v => v.id === row.venueId);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{venue?.name ?? `#${row.venueId}`}</TableCell>
                      <TableCell>{row.ownerName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.ownerEmail ?? "—"}</TableCell>
                      <TableCell>
                        {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
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
  );
}

function OwnerAccountsCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.ownerAccounts.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const accounts = data?.accounts ?? [];
  const venues = data?.venues ?? [];

  const setPassword = trpc.admin.setOwnerAccountPassword.useMutation({
    onSuccess: () => {
      toast.success("Password updated — the owner will need to sign in again with the new password");
      utils.admin.ownerAccounts.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const setVenue = trpc.admin.setOwnerAccountVenue.useMutation({
    onSuccess: () => {
      toast.success("Owner scope updated");
      utils.admin.ownerAccounts.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const deleteAccount = trpc.admin.deleteOwnerAccount.useMutation({
    onSuccess: () => {
      toast.success("Owner account removed — that login no longer works");
      utils.admin.ownerAccounts.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="mt-6 border-border bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-accent" /> Owner login accounts
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and control the username/password logins for venue owners. Create an
              account, hand the credentials to the venue owner, and change or revoke them
              anytime.
            </p>
          </div>
          <CreateOwnerAccountDialog venues={venues} />
        </div>

        {isLoading ? (
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !accounts.length ? (
          <p className="mt-4 text-sm text-muted-foreground">No owner login accounts yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Manages</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(row => {
                  const venue = row.venueId ? venues.find(v => v.id === row.venueId) : null;
                  const isMaster = row.username.toLowerCase() === "owner";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs font-semibold">
                        {row.username}
                        {isMaster && (
                          <Badge className="ml-2 bg-accent/15 text-accent border-0">master admin</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isMaster ? (
                          <span className="text-xs text-muted-foreground">All venues (system-wide)</span>
                        ) : venue ? (
                          venue.name
                        ) : (
                          <span className="text-xs text-muted-foreground">— no venue (global)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(row.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {isMaster ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="press bg-transparent"
                              onClick={() =>
                                toast("The master admin password can only be changed by Manus support")
                              }>
                              <KeyRound className="h-4 w-4 mr-1.5" /> Locked
                            </Button>
                          ) : (
                            <>
                              <PasswordDialog
                                accountId={row.id}
                                username={row.username}
                                onDone={pw => setPassword.mutate({ id: row.id, password: pw })}
                              />
                              <VenueDialog
                                accountId={row.id}
                                currentVenueId={row.venueId}
                                venues={venues}
                                onDone={venueId => setVenue.mutate({ id: row.id, venueId })}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 press bg-transparent text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="Delete owner account"
                                disabled={deleteAccount.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete the login account "${row.username}"? They will no longer be able to sign in. Their venue's data stays intact.`,
                                    )
                                  ) {
                                    deleteAccount.mutate({ id: row.id });
                                  }
                                }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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
  );
}

function PasswordDialog({
  accountId,
  username,
  onDone,
}: {
  accountId: number;
  username: string;
  onDone: (password: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = open && pw.length >= 8 && pw !== confirm;
  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) {
          setPw("");
          setConfirm("");
        }
      }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="press bg-transparent">
          <KeyRound className="h-4 w-4 mr-1.5" /> Password
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Set a new sign-in password for "{username}".</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>New password *</Label>
            <Input
              className="bg-background"
              type="password"
              placeholder="At least 8 characters"
              value={pw}
              onChange={e => setPw(e.target.value)}
              maxLength={128}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password *</Label>
            <Input
              className="bg-background"
              type="password"
              placeholder="Repeat the new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              maxLength={128}
            />
            {mismatch && <p className="text-xs text-destructive">Passwords do not match</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="press"
            disabled={pw.length < 8 || mismatch || confirm.length === 0}
            onClick={() => {
              onDone(pw);
              setOpen(false);
            }}>
            Save password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VenueDialog({
  accountId,
  currentVenueId,
  venues,
  onDone,
}: {
  accountId: number;
  currentVenueId: number | null;
  venues: { id: number; name: string }[];
  onDone: (venueId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(
    currentVenueId !== null ? String(currentVenueId) : "none",
  );
  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) setVenueId(currentVenueId !== null ? String(currentVenueId) : "none");
      }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="press bg-transparent">
          <DoorOpen className="h-4 w-4 mr-1.5" /> Venue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Scope this owner</DialogTitle>
          <DialogDescription>
            Bind the owner to one venue, or leave them global to manage all venues.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Venue</Label>
          <Select value={venueId ?? undefined} onValueChange={setVenueId}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Select venue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Global — manage all venues</SelectItem>
              {venues.map(v => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="press"
            onClick={() => {
              onDone(venueId === "none" ? null : Number(venueId));
              setOpen(false);
            }}>
            Save scope
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateOwnerAccountDialog({ venues }: { venues: { id: number; name: string }[] }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [venueId, setVenueId] = useState<string>("none");

  const create = trpc.admin.createOwnerAccount.useMutation({
    onSuccess: () => {
      toast.success(
        `Owner account created. Sign-in: "${username}" / the password you set.`,
        { duration: 8000 },
      );
      setOpen(false);
      setUsername("");
      setPw("");
      setConfirm("");
      setVenueId("none");
      utils.admin.ownerAccounts.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const mismatch = pw.length >= 8 && pw !== confirm;
  const canSubmit = username.trim().length > 0 && !mismatch && pw.length >= 8 && confirm.length >= 8;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="press bg-transparent">
          <UserPlus className="h-4 w-4 mr-1.5" /> Create owner account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create owner login</DialogTitle>
          <DialogDescription>
            Create a username/password login for a venue owner. The username becomes their
            sign-in name — the venue's exact name keeps things easy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Username *</Label>
            <Input
              className="bg-background"
              placeholder="e.g. CrisRon"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              Use the venue's exact name as the username so owners find it easily.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Password *</Label>
            <Input
              className="bg-background"
              type="password"
              placeholder="At least 8 characters"
              value={pw}
              onChange={e => setPw(e.target.value)}
              maxLength={128}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm password *</Label>
            <Input
              className="bg-background"
              type="password"
              placeholder="Repeat the password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              maxLength={128}
            />
            {mismatch && <p className="text-xs text-destructive">Passwords do not match</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Global — manage all venues</SelectItem>
                {venues.map(v => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="press"
            disabled={!canSubmit || create.isPending}
            onClick={() =>
              create.mutate({
                username: username.trim(),
                password: pw,
                venueId: venueId === "none" ? null : Number(venueId),
              })
            }>
            {create.isPending ? "Creating…" : "Create account"}
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

  const removeCourt = trpc.bookings.removeCourt.useMutation({
    onSuccess: () => {
      toast.success("Court removed");
      utils.courts.byVenue.invalidate();
      utils.venues.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="mt-6 border-border bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Wrench className="h-5 w-5 text-accent" /> Courts
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Toggle court status, add new courts, or remove courts that have no upcoming bookings.
            </p>
          </div>
          <AddCourtDialog defaultVenue={selectedVenue ?? venues?.[0]?.id ?? null} venues={venues ?? []} />
        </div>
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
            <div key={c.id} className="flex items-center gap-1.5">
              <Button
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 press bg-transparent text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Remove court"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${c.courtNumber}? Courts with upcoming bookings cannot be removed.`,
                    )
                  ) {
                    removeCourt.mutate({ courtId: c.id });
                  }
                }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AddCourtDialog({ defaultVenue, venues }: { defaultVenue: number | null; venues: { id: number; name: string }[] }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [courtNumber, setCourtNumber] = useState("");
  const [venueId, setVenueId] = useState<number | null>(defaultVenue ?? null);

  const create = trpc.bookings.createCourt.useMutation({
    onSuccess: () => {
      toast.success("Court added");
      setCourtNumber("");
      setOpen(false);
      utils.courts.byVenue.invalidate();
      utils.venues.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) setVenueId(defaultVenue ?? null);
      }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="press bg-transparent">
          <Plus className="h-4 w-4 mr-1.5" /> Add court
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a court</DialogTitle>
          <DialogDescription>Add a new court to a venue, e.g. “Court 9”.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Venue *</Label>
            <Select
              value={venueId !== null ? String(venueId) : undefined}
              onValueChange={v => setVenueId(Number(v))}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select venue" />
              </SelectTrigger>
              <SelectContent>
                {venues.map(v => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Court label *</Label>
            <Input
              className="bg-background"
              placeholder="Court 9"
              value={courtNumber}
              onChange={e => setCourtNumber(e.target.value)}
              maxLength={16}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="press"
            disabled={create.isPending || !courtNumber.trim() || venueId === null}
            onClick={() =>
              create.mutate({ venueId: venueId!, courtNumber: courtNumber.trim() })
            }>
            {create.isPending ? "Adding…" : "Add court"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
