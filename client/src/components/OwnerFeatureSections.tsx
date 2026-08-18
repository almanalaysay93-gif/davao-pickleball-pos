import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  BarChart3,
  Download,
  FileText,
  KeyRound,
  Loader2,
  Mail,
  Megaphone,
  ReceiptText,
  SearchX,
  Sparkles,
  Trash2,
  Users,
  Tag,
  Percent,
  TimerOff,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatPHP } from "@shared/rates";

/** YYYY-MM-DD for a Date in the local timezone. */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

/* ────────────────────────────────────────────────────────────────────────────
   Staff management (owners only — staff members can't manage staff)
──────────────────────────────────────────────────────────────────────────── */

type StaffRow = {
  id: number;
  userId: number;
  venueId: number;
  role: string;
  createdAt: string | Date;
  userName: string | null;
  userEmail: string | null;
};

export function OwnerStaffSection({ venueIds }: { venueIds: number[] }) {
  const utils = trpc.useUtils();
  const staffQuery = trpc.owner.staff.useQuery({}, {
    refetchOnWindowFocus: false,
    select: (data: any) => data as { rows: StaffRow[] },
  });
  const venues = trpc.owner.myVenues.useQuery(undefined, {
    refetchOnWindowFocus: false,
    select: (data: any) => data as { id: number; name: string }[],
  });
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addVenueId, setAddVenueId] = useState<number | null>(venueIds[0] ?? null);
  const [addRole, setAddRole] = useState<"staff" | "owner">("staff");

  const addStaff = trpc.owner.addStaff.useMutation({
    onSuccess: res => {
      setAddOpen(false);
      setAddEmail("");
      toast.success("Staff added — they can now sign in to the owner portal");
      if (res.provisioned) {
        toast(
          <>
            <div className="font-semibold">One-time login for {res.username}</div>
            <div className="text-xs text-muted-foreground">
              Password: <span className="font-mono font-semibold text-foreground">{res.oneTimePassword}</span>{" "}
              (login at the owner portal — username is their email)
            </div>
          </>,
          { duration: 30000 },
        );
      }
      void utils.owner.staff.invalidate();
      void utils.owner.myVenues.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const removeStaff = trpc.owner.removeStaff.useMutation({
    onSuccess: () => {
      toast.success("Staff removed");
      void utils.owner.staff.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const myStaff = (staffQuery.data?.rows ?? []).filter(s => venueIds.includes(s.venueId));

  const venueName = (venueId: number) => venues.data?.find(v => v.id === venueId)?.name ?? `Venue #${venueId}`;

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-accent" /> Team &amp; staff
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give trusted team members access to the owner portal. Their login username is their
            email address — a one-time password is shown when you add them.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="press bg-transparent">
              <Users className="h-4 w-4 mr-1.5" /> Add staff
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add team member</DialogTitle>
              <DialogDescription>
                The staff member must have signed in to the customer app at least once (their
                email becomes their owner-portal username). Only the owner can manage staff.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {venues.data && venues.data.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Venue</Label>
                  <Select
                    value={addVenueId !== null ? String(addVenueId) : undefined}
                    onValueChange={v => setAddVenueId(Number(v))}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select venue" />
                    </SelectTrigger>
                    <SelectContent>
                      {venues.data.map(v => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Email (becomes the login username)</Label>
                <Input
                  className="bg-background"
                  type="email"
                  placeholder="juan@example.com"
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={addRole} onValueChange={v => setAddRole(v as "staff" | "owner")}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff — courts, bookings, announcements</SelectItem>
                    <SelectItem value="owner">Owner — same access as you</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="press bg-transparent" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button
                className="press"
                disabled={addStaff.isPending || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addEmail)}
                onClick={() => {
                  if (addVenueId === null) { toast.error("Pick a venue"); return; }
                  addStaff.mutate({ venueId: addVenueId, email: addEmail.trim().toLowerCase(), role: addRole });
                }}>
                {addStaff.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Add staff
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mt-4 border-border bg-card">
        <CardContent className="p-0">
          {staffQuery.isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !myStaff.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No staff yet. Add a team member so they can help manage your venue(s).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email / login</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myStaff.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-40 truncate">{s.userName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{s.userEmail ?? "—"}</TableCell>
                      <TableCell>{venueName(s.venueId)}</TableCell>
                      <TableCell>
                        <Badge variant={s.role === "owner" ? "secondary" : "outline"} className="text-[10px]">
                          {s.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(s.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 press bg-transparent text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Remove staff"
                          onClick={() => {
                            if (window.confirm(`Remove ${s.userEmail ?? "this team member"} from the venue?`)) {
                              removeStaff.mutate({ userId: s.userId, venueId: s.venueId });
                            }
                          }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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

/* ────────────────────────────────────────────────────────────────────────────
   Reports with CSV export
──────────────────────────────────────────────────────────────────────────── */

export function OwnerReportsSection({ venueIds }: { venueIds: number[] }) {
  const venues = trpc.owner.myVenues.useQuery(undefined, {
    refetchOnWindowFocus: false,
    select: (data: any) => data as { id: number; name: string }[],
  });
  const now = new Date();
  const [start, setStart] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return fmtDate(d);
  });
  const [end, setEnd] = useState(() => fmtDate(now));
  const [venueId, setVenueId] = useState<number | null>(venueIds.length === 1 ? venueIds[0] : null);

  const reports = trpc.owner.reports.useQuery(
    { venueId: venueId ?? undefined, start, end },
    { refetchOnWindowFocus: false },
  );

  const downloadCsv = () => {
    const data = reports.data;
    if (!data) return;
    const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `davao-pickleball-report-${start}-to-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  return (
    <div className="mt-10">
      <h2 className="font-display text-xl font-semibold flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-accent" /> Reports
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Daily revenue and booking summary across your venue(s). Change the range and export as CSV.
      </p>

      <Card className="mt-4 border-border bg-card">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[auto_auto_auto] items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="bg-background"
                value={start}
                max={end}
                onChange={e => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="bg-background"
                value={end}
                min={start}
                max={fmtDate(new Date())}
                onChange={e => setEnd(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 md:hidden" />
            {venues.data && venues.data.length > 1 && (
              <div className="space-y-1.5 col-span-2 md:col-span-1">
                <Label className="text-xs">Venue</Label>
                <Select
                  value={venueId !== null ? String(venueId) : "all"}
                  onValueChange={v => setVenueId(v === "all" ? null : Number(v))}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All venues</SelectItem>
                    {venues.data.map(v => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {reports.isLoading ? (
            <div className="mt-5 p-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-3 stagger">
                <ReportStatCard label="Revenue (paid)" value={formatPHP(reports.data?.revenue ?? 0)} accent="text-success" />
                <ReportStatCard label="Paid bookings" value={reports.data?.paidCount ?? 0} accent="text-primary" />
                <ReportStatCard label="Pending payment" value={reports.data?.pendingCount ?? 0} accent="text-warning" />
              </div>

              {(reports.data?.days?.length ?? 0) === 0 ? (
                <p className="mt-5 text-center text-sm text-muted-foreground py-4">
                  No bookings in this range — adjust the dates.
                </p>
              ) : (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      {reports.data?.totalBookings ?? 0} bookings · per-day breakdown
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="press bg-transparent"
                      disabled={reports.isLoading}
                      onClick={downloadCsv}>
                      <Download className="h-4 w-4 mr-1.5" /> Export CSV
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                          <TableHead className="text-right">Slots booked</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reports.data?.days ?? []).map(d => (
                          <TableRow key={d.date}>
                            <TableCell className="whitespace-nowrap">{d.date}</TableCell>
                            <TableCell className="text-right font-medium">{formatPHP(d.revenue)}</TableCell>
                            <TableCell className="text-right">{d.paidCount}</TableCell>
                            <TableCell className="text-right">{d.pendingCount}</TableCell>
                            <TableCell className="text-right">{d.slots}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportStatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Memberships management
──────────────────────────────────────────────────────────────────────────── */

type MembershipRow = {
  id: number;
  venueId: number;
  name: string;
  description: string | null;
  price: string;
  credits: number;
  validityDays: number;
  active: boolean;
  memberCount: number;
  totalCreditsRemaining: number;
};

export function OwnerMembershipsSection({ venueIds }: { venueIds: number[] }) {
  const utils = trpc.useUtils();
  const venues = trpc.owner.myVenues.useQuery(undefined, {
    refetchOnWindowFocus: false,
    select: (data: any) => data as { id: number; name: string }[],
  });
  const membershipsQuery = trpc.owner.memberships.useQuery(
    { venueId: venueIds[0] ?? 0 },
    {
      enabled: venueIds.length > 0,
      refetchOnWindowFocus: false,
      select: (data: any) => data as MembershipRow[],
    },
  );
  const [planOpen, setPlanOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState<MembershipRow | null>(null);
  const [planVenueId, setPlanVenueId] = useState<number | null>(venueIds[0] ?? null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [credits, setCredits] = useState("1");
  const [validityDays, setValidityDays] = useState("30");

  const createMembership = trpc.owner.createMembership.useMutation({
    onSuccess: () => {
      setPlanOpen(false);
      setName(""); setDescription(""); setPrice(""); setCredits("1"); setValidityDays("30");
      toast.success("Membership plan added");
      void utils.owner.memberships.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const deleteMembership = trpc.owner.deleteMembership.useMutation({
    onSuccess: () => {
      toast.success("Plan removed");
      void utils.owner.memberships.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const sellMembership = trpc.owner.sellMembership.useMutation({
    onSuccess: () => {
      toast.success("Membership sold — credits are valid for 30 days");
      setSellOpen(null);
      void utils.owner.memberships.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const myRows = (membershipsQuery.data as MembershipRow[] | undefined) ?? [];
  const venueName = (venueId: number) => venues.data?.find(v => v.id === venueId)?.name ?? `Venue #${venueId}`;

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" /> Membership packages
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sell session bundles or credits. Members redeem them at checkout instead of paying
            cash — players will also see the plans on the booking page.
          </p>
        </div>
        <Dialog open={planOpen} onOpenChange={setPlanOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="press bg-transparent">
              <Plus className="h-4 w-4 mr-1.5" /> New package
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New membership package</DialogTitle>
              <DialogDescription>
                A package players can buy once and redeem sessions/credits over its validity period.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {venues.data && venues.data.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Venue</Label>
                  <Select
                    value={planVenueId !== null ? String(planVenueId) : undefined}
                    onValueChange={v => setPlanVenueId(Number(v))}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select venue" />
                    </SelectTrigger>
                    <SelectContent>
                      {venues.data.map(v => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Package name *</Label>
                <Input className="bg-background" placeholder="10-Pack Night Pass" value={name} onChange={e => setName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea className="bg-background min-h-16" placeholder="10 night-session credits, valid 30 days" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Price (PHP) *</Label>
                  <Input className="bg-background" placeholder="2500" value={price} onChange={e => setPrice(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Credits</Label>
                  <Input className="bg-background" type="number" min={1} value={credits} onChange={e => setCredits(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Validity (days)</Label>
                  <Input className="bg-background" type="number" min={1} value={validityDays} onChange={e => setValidityDays(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="press bg-transparent" onClick={() => setPlanOpen(false)}>Cancel</Button>
              <Button
                className="press"
                disabled={createMembership.isPending || !name.trim() || !/^\d+(\.\d{1,2})?$/.test(price) || planVenueId === null}
                onClick={() =>
                  createMembership.mutate({
                    venueId: planVenueId!,
                    name: name.trim(),
                    description: description.trim() || undefined,
                    price,
                    credits: Math.max(1, Number(credits) || 1),
                    validityDays: Math.max(1, Number(validityDays) || 30),
                  })
                }>
                {createMembership.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create package
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mt-4 border-border bg-card">
        <CardContent className="p-0">
          {membershipsQuery.isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !myRows.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No membership packages yet. Create one to offer bundles to regular players.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Package</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Credits left</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRows.map(m => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{m.name}</div>
                        {m.description && <div className="text-xs text-muted-foreground max-w-56 truncate">{m.description}</div>}
                      </TableCell>
                      <TableCell>{venueName(m.venueId)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPHP(Number(m.price))}</TableCell>
                      <TableCell className="text-right">{m.credits}</TableCell>
                      <TableCell className="text-right">{m.memberCount}</TableCell>
                      <TableCell className="text-right">{m.totalCreditsRemaining}</TableCell>
                      <TableCell>
                        <Badge variant={m.active ? "secondary" : "outline"} className="text-[10px]">
                          {m.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="press bg-transparent text-xs"
                            onClick={() => setSellOpen(m)}>
                            <Users className="h-3.5 w-3.5 mr-1" /> Sell
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 press bg-transparent text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Delete package"
                            onClick={() => {
                              if (window.confirm(`Delete the "${m.name}" package? Sold memberships stay valid until expiry.`)) {
                                deleteMembership.mutate({ id: m.id });
                              }
                            }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Sell membership dialog */}
      <Dialog open={!!sellOpen} onOpenChange={open => !open && setSellOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sell {sellOpen?.name}</DialogTitle>
            <DialogDescription>
              {formatPHP(Number(sellOpen?.price ?? 0))} · {sellOpen?.credits} credits · valid{" "}
              {sellOpen?.validityDays} days from today.
            </DialogDescription>
          </DialogHeader>
          <SellMembershipForm
            membershipId={sellOpen?.id ?? 0}
            onSubmit={(name, phone) =>
              sellMembership.mutate({ membershipId: sellOpen!.id, name: name.trim(), phone: phone.trim() || undefined })
            }
            isPending={sellMembership.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SellMembershipForm({
  membershipId,
  onSubmit,
  isPending,
}: {
  membershipId: number;
  onSubmit: (name: string, phone: string) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  void membershipId;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Member name *</Label>
        <Input className="bg-background" placeholder="Juan Dela Cruz" value={name} onChange={e => setName(e.target.value)} maxLength={128} />
      </div>
      <div className="space-y-1.5">
        <Label>Phone (optional)</Label>
        <Input className="bg-background" placeholder="09XX XXX XXXX" value={phone} onChange={e => setPhone(e.target.value)} maxLength={32} />
      </div>
      <DialogFooter>
        <Button
          className="press w-full"
          disabled={isPending || !name.trim()}
          onClick={() => onSubmit(name.trim(), phone.trim())}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirm sale
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Waitlist management (per venue)
──────────────────────────────────────────────────────────────────────────── */

type WaitlistRow = {
  id: number;
  venueId: number;
  courtId: number;
  playerDate: string;
  startHour: string;
  endHour: string;
  playerName: string;
  contact: string | null;
  status: string;
  createdAt: string | Date;
  venueName: string;
  courtNumber: string;
};

export function OwnerWaitlistSection({ venueIds }: { venueIds: number[] }) {
  const utils = trpc.useUtils();
  const waitlistQuery = trpc.owner.waitlist.useQuery(
    { venueId: venueIds[0] ?? 0 },
    { enabled: venueIds.length > 0, refetchOnWindowFocus: true, refetchInterval: 20000 },
  );
  const venues = trpc.owner.myVenues.useQuery(undefined, {
    refetchOnWindowFocus: false,
    select: (data: any) => data as { id: number; name: string }[],
  });

  const notify = trpc.owner.notifyWaitlist.useMutation({
    onSuccess: () => {
      toast.success("Marked as notified — call the player when the slot opens");
      void utils.owner.waitlist.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const dismiss = trpc.owner.dismissWaitlist.useMutation({
    onSuccess: () => {
      toast.success("Removed from waitlist");
      void utils.owner.waitlist.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const rows = (waitlistQuery.data ?? []).filter(w => venueIds.includes(w.venueId));
  const venueName = (venueId: number) => venues.data?.find(v => v.id === venueId)?.name ?? `Venue #${venueId}`;

  return (
    <div className="mt-10">
      <h2 className="font-display text-xl font-semibold flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-accent" /> Slot waitlist
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Players waiting for fully-booked slots. When one frees up, notify the first person in
        line — they are automatically removed from the queue once notified.
      </p>

      <Card className="mt-4 border-border bg-card">
        <CardContent className="p-0">
          {waitlistQuery.isLoading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !rows.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No players are on the waitlist right now.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Date &amp; time</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium text-sm">{w.playerName}</TableCell>
                      <TableCell>
                        <div className="text-sm">{venueName(w.venueId)}</div>
                        <div className="text-xs text-muted-foreground">{w.courtNumber}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {w.playerDate} · {w.startHour}–{w.endHour}
                      </TableCell>
                      <TableCell className="text-sm">{w.contact ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(w.createdAt as string | number | Date).toLocaleString("en-US", {
                          timeZone: "Asia/Manila",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        {w.notified ? (
                          <Badge variant="secondary" className="text-[10px]">Notified</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Waiting</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!w.notified && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="press bg-transparent text-xs"
                            onClick={() => notify.mutate({ id: w.id, venueId: w.venueId })}>
                            <Mail className="h-3.5 w-3.5 mr-1" /> Notify
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 press bg-transparent text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Remove from waitlist"
                          onClick={() => dismiss.mutate({ id: w.id, venueId: w.venueId })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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

/* ────────────────────────────────────────────────────────────────────────────
   Recurring booking series (owner self-serve)
──────────────────────────────────────────────────────────────────────────── */

function Plus({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function OwnerSeriesDialog({ venues }: { venues: { id: number; name: string }[] }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [venueId, setVenueId] = useState<number | null>(venues[0]?.id ?? null);
  const courtsQuery = trpc.owner.courtsForVenue.useQuery(
    { venueId: venueId ?? 0 },
    { enabled: venueId !== null, refetchOnWindowFocus: false },
  );
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [startDate, setStartDate] = useState(todayStr);
  const [startHour, setStartHour] = useState("");
  const [endHour, setEndHour] = useState("");
  const [weeks, setWeeks] = useState("4");
  const [weekdays, setWeekdays] = useState<number[]>([now.getDay()]);
  const [playerName, setPlayerName] = useState("");
  const [contact, setContact] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("unpaid");

  const createSeries = trpc.owner.createSeries.useMutation({
    onSuccess: res => {
      toast.success(
        res.createdCount === 0
          ? "No new bookings — every week conflicted with an existing reservation"
          : `${res.createdCount} booking(s) created across ${weeks} week(s)` + (res.skippedCount ? ` (${res.skippedCount} skipped due to conflicts)` : ""),
      );
      utils.owner.bookings.invalidate();
      utils.availability.forVenueDate.invalidate();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const toggleWeekday = (wd: number) =>
    setWeekdays(prev => (prev.includes(wd) ? prev.filter(x => x !== wd) : [...prev, wd].sort()));

  const submit = () => {
    if (venueId === null || !startDate || !startHour || !endHour || !playerName.trim() || weekdays.length === 0) {
      toast.error("Please complete all required fields, including at least one weekday");
      return;
    }
    if (/^\d{2}:\d{2}$/.test(startHour) && /^\d{2}:\d{2}$/.test(endHour) && endHour <= startHour) {
      toast.error("End time must be later than start time");
      return;
    }
    createSeries.mutate({
      venueId,
      courtId: Number(
        (courtsQuery.data as { id: number; status: string }[] | undefined)?.find(c => c.status === "available")?.id ?? 0,
      ),
      startHour,
      endHour,
      startDate,
      weeks: Math.max(1, Number(weeks) || 4),
      weekdays,
      playerName: playerName.trim(),
      contact: contact.trim() || undefined,
      paymentMethod: paymentMethod === "unpaid" ? undefined : paymentMethod,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="press bg-transparent">
          <ReceiptText className="h-4 w-4 mr-1.5" /> Recurring booking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recurring booking series</DialogTitle>
          <DialogDescription>
            Book the same slot on repeating weekdays for several weeks — each occurrence becomes
            its own reservation. Slots that are already taken are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {venues.length > 1 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Venue *</Label>
              <Select
                value={venueId !== null ? String(venueId) : undefined}
                onValueChange={v => setVenueId(Number(v))}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
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
          )}
          <div className="space-y-1.5">
            <Label>Start date *</Label>
            <Input type="date" className="bg-background" value={startDate} min={todayStr} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Weeks *</Label>
            <Input type="number" min={1} max={52} className="bg-background" value={weeks} onChange={e => setWeeks(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Start time *</Label>
            <Input className="bg-background" placeholder="18:00" value={startHour} onChange={e => setStartHour(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End time *</Label>
            <Input className="bg-background" placeholder="20:00" value={endHour} onChange={e => setEndHour(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Weekdays *</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(wd => (
                <button
                  key={wd.value}
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    weekdays.includes(wd.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:border-primary/50"
                  }`}
                  onClick={() => toggleWeekday(wd.value)}>
                  {wd.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Player name *</Label>
            <Input className="bg-background" placeholder="Juan Dela Cruz" value={playerName} onChange={e => setPlayerName(e.target.value)} maxLength={128} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact</Label>
            <Input className="bg-background" placeholder="09XX XXX XXXX" value={contact} onChange={e => setContact(e.target.value)} maxLength={64} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Pending (pay later)</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="press" onClick={submit} disabled={createSeries.isPending}>
            {createSeries.isPending ? "Creating…" : `Create ${weeks || 0}-week series`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Waitlist join dialog (customer side, rendered from Schedule)
──────────────────────────────────────────────────────────────────────────── */

export function JoinWaitlistDialog({
  venueId,
  courtId,
  courtNumber,
  playerDate,
  startHour,
  endHour,
  open,
  onOpenChange,
}: {
  venueId: number;
  courtId: number;
  courtNumber: string;
  playerDate: string;
  startHour: string;
  endHour: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [playerName, setPlayerName] = useState("");
  const [contact, setContact] = useState("");

  const join = trpc.waitlist.join.useMutation({
    onSuccess: res => {
      toast.success(`You're #${res.position} on the waitlist — we'll reach out when this slot opens up`);
      setPlayerName("");
      setContact("");
      onOpenChange(false);
      void utils.availability.forVenueDate.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!playerName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    join.mutate({ venueId, courtId, playerDate, startHour, endHour, playerName: playerName.trim(), contact: contact.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Join the waitlist</DialogTitle>
          <DialogDescription>
            Court {courtNumber} on {playerDate}, {startHour}–{endHour} is fully booked. Leave your
            details and we'll let you know the moment it frees up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Your name *</Label>
            <Input className="bg-background" placeholder="Juan Dela Cruz" value={playerName} onChange={e => setPlayerName(e.target.value)} maxLength={128} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone / contact</Label>
            <Input className="bg-background" placeholder="09XX XXX XXXX" value={contact} onChange={e => setContact(e.target.value)} maxLength={64} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="press bg-transparent" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="press" disabled={join.isPending} onClick={submit}>
            {join.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Join waitlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Notification bell (owner header)
──────────────────────────────────────────────────────────────────────────── */

export function OwnerNotificationsBell() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const notifications = trpc.owner.notifications.useQuery({}, {
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    select: (data: any) =>
      data as {
        count: number;
        rows: {
          id: number;
          venueId: number;
          reference: string;
          courtId: number;
          playerDate: string;
          startHour: string;
          endHour: string;
          playerName: string;
          channel: string;
          totalAmount: string;
          paymentStatus: string;
          venueName: string;
          courtNumber: string | null;
          createdAt: string;
        }[];
      },
  });
  const markRead = trpc.owner.markNotificationsRead.useMutation({
    onSuccess: () => void utils.owner.notifications.invalidate(),
  });

  const count = notifications.data?.count ?? 0;
  const rows = notifications.data?.rows ?? [];

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="press bg-transparent relative"
        aria-label={`Notifications${count ? ` (${count} unread)` : ""}`}
        onClick={() => {
          setOpen(v => !v);
          if (count > 0) markRead.mutate({});
        }}>
        <span className="h-5 w-5 relative inline-flex">
          <Mail className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </span>
      </Button>

      {open && (
        <Card className="absolute right-0 mt-2 w-[min(92vw,360px)] z-50 border-border bg-background shadow-xl p-0 stagger fade-in">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-accent" /> New bookings
              </span>
              {count > 0 && (
                <span className="text-[11px] text-muted-foreground">{count} unread</span>
              )}
            </div>
            {!notifications.data ? (
              <div className="p-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <SearchX className="h-5 w-5" />
                All caught up — no new bookings.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {rows.map(b => (
                  <div key={b.id} className="px-4 py-3 border-b border-border/60 last:border-b-0 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{b.playerName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold whitespace-nowrap">
                        new
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap">
                      {b.venueName} · {b.courtNumber ?? `#${b.courtId}`} · {b.playerDate} {b.startHour}–{b.endHour}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">#{b.reference}</span>
                      <span className="font-medium">{formatPHP(Number(b.totalAmount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Promo codes manager (owners only)
──────────────────────────────────────────────────────────────────────────── */

export function OwnerPromoCodesSection({ venueIds }: { venueIds: number[] }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [venueId, setVenueId] = useState<number>(venueIds[0] ?? 0);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"pct" | "flat">("pct");
  const [discountPct, setDiscountPct] = useState("");
  const [discountFlat, setDiscountFlat] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const codes = trpc.owner.promoCodes.useQuery(
    { venueId: venueIds.length === 1 ? venueIds[0] : undefined },
    { refetchOnWindowFocus: false },
  );
  const visible = (codes.data ?? []).filter(c =>
    venueIds.length > 1 || Number(c.venueId) === Number(venueId),
  );

  const create = trpc.owner.createPromoCode.useMutation({
    onSuccess: () => {
      toast.success(`Promo code ${code.trim().toUpperCase()} created`);
      utils.owner.promoCodes.invalidate();
      setOpen(false);
      setCode("");
      setDiscountPct("");
      setDiscountFlat("");
      setMinAmount("");
      setMaxUses("");
      setExpiresAt("");
    },
    onError: e => toast.error(e.message),
  });
  const toggle = trpc.owner.updatePromoCode.useMutation({
    onSuccess: () => void utils.owner.promoCodes.invalidate(),
    onError: e => toast.error(e.message),
  });
  const remove = trpc.owner.deletePromoCode.useMutation({
    onSuccess: () => {
      toast.success("Promo code deleted");
      void utils.owner.promoCodes.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const venues = trpc.owner.myVenues.useQuery(undefined, {
    enabled: venueIds.length > 1,
  }) as unknown as { data?: { id: number; name: string }[] };

  const submit = () => {
    const c = code.trim().toUpperCase();
    const discount: Record<string, unknown> =
      mode === "pct"
        ? { discountPct: parseFloat(discountPct) }
        : { discountFlat: parseFloat(discountFlat) };
    create.mutate({
      venueId,
      code: c,
      ...discount,
      minAmount: minAmount.trim() ? parseFloat(minAmount) : undefined,
      maxUses: maxUses.trim() ? parseInt(maxUses, 10) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
  };

  const now = Date.now();
  const isExpired = (c: { expiresAt: string | null }) =>
    c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
  const isUsedUp = (c: { maxUses: number | null; uses: number }) =>
    c.maxUses != null && c.uses >= Number(c.maxUses);

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-accent" />
            <div>
              <h3 className="font-display text-lg font-semibold">Promo codes</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Discount codes players redeem at checkout.
              </p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="press bg-transparent text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> New code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create a promo code</DialogTitle>
                <DialogDescription>
                  Players enter the code at checkout to get a discount on their booking.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {venueIds.length > 1 && (
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium">Venue *</Label>
                    <Select value={String(venueId)} onValueChange={v => setVenueId(Number(v))}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(venues.data ?? []).map((v: { id: number; name: string }) => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Code *</span>
                  <Input
                    className="bg-background uppercase"
                    placeholder="SUMMERDUNK"
                    value={code}
                    onChange={e =>
                      setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32))
                    }
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Letters, numbers, _ and - only (shown uppercase).
                  </span>
                </Label>
                <div className="flex items-center gap-2">
                  {(["pct", "flat"] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors duration-150 press ${
                        mode === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      {m === "pct" ? "Percentage" : "Flat ₱"}
                    </button>
                  ))}
                </div>
                {mode === "pct" ? (
                  <Label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Discount % *</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="bg-background"
                      placeholder="20"
                      value={discountPct}
                      onChange={e => setDiscountPct(e.target.value)}
                    />
                  </Label>
                ) : (
                  <Label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Flat discount ₱ *</span>
                    <Input
                      type="number"
                      min={0}
                      className="bg-background"
                      placeholder="50"
                      value={discountFlat}
                      onChange={e => setDiscountFlat(e.target.value)}
                    />
                  </Label>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Min booking ₱</span>
                    <Input
                      type="number"
                      min={0}
                      className="bg-background"
                      placeholder="0"
                      value={minAmount}
                      onChange={e => setMinAmount(e.target.value)}
                    />
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      Required total before the discount applies.
                    </span>
                  </Label>
                  <Label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Max uses</span>
                    <Input
                      type="number"
                      min={1}
                      className="bg-background"
                      placeholder="Unlimited"
                      value={maxUses}
                      onChange={e => setMaxUses(e.target.value)}
                    />
                  </Label>
                </div>
                <Label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Expires (optional)</span>
                  <Input
                    type="datetime-local"
                    className="bg-background"
                    value={expiresAt}
                    onChange={e => setExpiresAt(e.target.value)}
                  />
                </Label>
              </div>
              <DialogFooter>
                <Button variant="outline" className="press bg-transparent" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  className="press"
                  disabled={
                    create.isPending ||
                    !venueId ||
                    !code.trim() ||
                    (mode === "pct" && (isNaN(parseFloat(discountPct)) || parseFloat(discountPct) <= 0)) ||
                    (mode === "flat" && (isNaN(parseFloat(discountFlat)) || parseFloat(discountFlat) <= 0))
                  }
                  onClick={submit}>
                  {create.isPending ? "Creating…" : "Create code"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-4 space-y-2">
          {!codes.data ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No promo codes yet. Create one to give players discounts at checkout.
            </p>
          ) : (
            visible.map(c => {
              const dead = !c.active || isExpired(c) || isUsedUp(c);
              return (
                <div key={c.id} className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs font-mono font-semibold">
                      <Ticket className="h-3 w-3 text-accent" />
                      {c.code}
                      <Badge variant={dead ? "outline" : "secondary"} className="text-[9px]">
                        {c.active === 0
                          ? "Deactivated"
                          : isExpired(c)
                            ? "Expired"
                            : isUsedUp(c)
                              ? "Used up"
                              : "Active"}
                      </Badge>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {c.discountPct != null ? (
                          <span className="flex items-center gap-0.5">
                            <Percent className="h-3 w-3" />{Number(c.discountPct)}% off
                          </span>
                        ) : (
                          <span>₱{Number(c.discountFlat ?? 0).toFixed(2)} off</span>
                        )}
                      </span>
                      {c.minAmount != null && Number(c.minAmount) > 0 && (
                        <span>Min ₱{Number(c.minAmount).toFixed(2)}</span>
                      )}
                      {c.maxUses != null && (
                        <span className="flex items-center gap-0.5">
                          <ShieldCheck className="h-3 w-3" />{c.uses}/{Number(c.maxUses)} used
                        </span>
                      )}
                      {c.expiresAt && (
                        <span className="flex items-center gap-0.5">
                          <TimerOff className="h-3 w-3" />
                          {new Date(c.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 press bg-transparent"
                      title={c.active === 1 ? "Deactivate code" : "Reactivate code"}
                      onClick={() => toggle.mutate({ id: c.id, active: c.active === 1 ? 0 : 1 })}>
                      <Tag className={`h-3.5 w-3.5 ${c.active === 1 ? "text-success" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 press bg-transparent text-destructive"
                      title="Delete code"
                      onClick={() => remove.mutate({ id: c.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
