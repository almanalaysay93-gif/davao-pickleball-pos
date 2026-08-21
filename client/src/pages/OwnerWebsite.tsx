import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatPHP } from "@shared/rates";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Megaphone,
  PlusCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";

const davaoVenues = [
  "Arena Athletics",
  "Southside Davao",
  "Matina Town Square",
  "Paddle Up Davao",
  "CrisRon",
  "PickleVille",
  "Durian Pickleball House",
  "929 Pickleyard",
];

export default function OwnerWebsite() {
  const [, navigate] = useLocation();
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  // Inquiry form state
  const [venueName, setVenueName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [courtCount, setCourtCount] = useState("2");
  const [district, setDistrict] = useState("Poblacion");

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!venueName.trim() || !ownerName.trim() || !phone.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setInquirySubmitted(true);
    toast.success("Venue registration request submitted! We will contact you shortly.");
    setTimeout(() => {
      setInquiryOpen(false);
      setInquirySubmitted(false);
      setVenueName("");
      setOwnerName("");
      setEmail("");
      setPhone("");
    }, 2500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-accent selection:text-white">
      {/* Header / Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur support-[backdrop-filter]:bg-background/80">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground font-display font-bold text-lg shadow-sm">
              DP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold tracking-tight">Davao Pickleball POS</span>
                <Badge variant="secondary" className="text-[10px] uppercase font-mono tracking-wider">
                  Owner Site
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">Venue Management &amp; Court POS Platform</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#demo" className="hover:text-foreground transition-colors">Interactive Demo</a>
            <a href="#venues" className="hover:text-foreground transition-colors">Davao Venues</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="hidden sm:inline-flex press bg-transparent">
                  <Store className="h-4 w-4 mr-1.5" /> Claim / Register Venue
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-accent" /> Register Your Davao Venue
                  </DialogTitle>
                  <DialogDescription>
                    Get set up on Davao's premier pickleball booking and POS system. Submit your details for instant account provision.
                  </DialogDescription>
                </DialogHeader>

                {inquirySubmitted ? (
                  <div className="py-8 text-center space-y-3">
                    <CheckCircle2 className="h-12 w-12 text-success mx-auto animate-bounce" />
                    <h3 className="text-lg font-semibold">Request Received!</h3>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Thank you, <span className="font-semibold">{ownerName}</span>. We are setting up credentials for{" "}
                      <span className="font-semibold">{venueName}</span>.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleInquirySubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="venueName">Venue Name *</Label>
                      <Input
                        id="venueName"
                        placeholder="e.g. Davao Courts Club"
                        value={venueName}
                        onChange={e => setVenueName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="ownerName">Contact Person *</Label>
                        <Input
                          id="ownerName"
                          placeholder="Your Name"
                          value={ownerName}
                          onChange={e => setOwnerName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone">Phone / Mobile *</Label>
                        <Input
                          id="phone"
                          placeholder="09XX XXX XXXX"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="owner@venue.ph"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="courtCount">Number of Courts</Label>
                        <Select value={courtCount} onValueChange={setCourtCount}>
                          <SelectTrigger id="courtCount">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 Court</SelectItem>
                            <SelectItem value="2">2 Courts</SelectItem>
                            <SelectItem value="3">3 Courts</SelectItem>
                            <SelectItem value="4">4 Courts</SelectItem>
                            <SelectItem value="6">6+ Courts</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="district">Davao District</Label>
                        <Select value={district} onValueChange={setDistrict}>
                          <SelectTrigger id="district">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Poblacion">Poblacion</SelectItem>
                            <SelectItem value="Matina">Matina</SelectItem>
                            <SelectItem value="Lanang">Lanang</SelectItem>
                            <SelectItem value="Buhangin">Buhangin</SelectItem>
                            <SelectItem value="Toril">Toril</SelectItem>
                            <SelectItem value="Talomo">Talomo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter className="mt-6">
                      <Button type="button" variant="outline" onClick={() => setInquiryOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" className="press">
                        Submit Request
                      </Button>
                    </DialogFooter>
                  </form>
                )}
              </DialogContent>
            </Dialog>

            <Button onClick={() => navigate("/owner-login")} className="press shadow-sm">
              <KeyRound className="h-4 w-4 mr-1.5" /> Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-accent/5 via-background to-background py-16 md:py-24">
        <div className="container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-4 py-1 px-3 border-accent/30 text-accent font-medium text-xs rounded-full">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 inline" /> Davao City Venue Operator Portal
            </Badge>

            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight text-balance">
              The Modern Court POS &amp; Management Platform for Davao Pickleball
            </h1>

            <p className="mt-6 text-lg md:text-xl text-muted-foreground text-balance leading-relaxed">
              Empower your court front-desk with real-time hourly reservations, front-desk walk-in cashiering,
              automated day/night rate tier billing, and live player announcements.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="w-full sm:w-auto press text-base font-semibold px-8 h-12 shadow-md" onClick={() => navigate("/owner-login")}>
                <KeyRound className="h-5 w-5 mr-2" /> Launch Owner Portal
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto press text-base font-medium px-8 h-12 bg-background/80"
                onClick={() => navigate("/owner-app")}
              >
                <LayoutDashboard className="h-5 w-5 mr-2 text-accent" /> Explore Owner Dashboard
              </Button>
            </div>
          </div>

          {/* Key KPI Highlights Bar */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <Card className="border-border bg-card/60 backdrop-blur text-center p-4">
              <div className="text-3xl font-display font-bold text-accent">8</div>
              <div className="text-xs text-muted-foreground font-medium mt-1">Davao Venues Operating</div>
            </Card>

            <Card className="border-border bg-card/60 backdrop-blur text-center p-4">
              <div className="text-3xl font-display font-bold text-success">100%</div>
              <div className="text-xs text-muted-foreground font-medium mt-1">Real-Time Availability Sync</div>
            </Card>

            <Card className="border-border bg-card/60 backdrop-blur text-center p-4">
              <div className="text-3xl font-display font-bold text-primary">Walk-In</div>
              <div className="text-xs text-muted-foreground font-medium mt-1">POS Cash, GCash &amp; Card</div>
            </Card>

            <Card className="border-border bg-card/60 backdrop-blur text-center p-4">
              <div className="text-3xl font-display font-bold text-foreground">Auto Tiers</div>
              <div className="text-xs text-muted-foreground font-medium mt-1">Day vs Night Rates</div>
            </Card>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-16 md:py-24 border-b border-border bg-muted/20">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Built For Venue Efficiency</p>
            <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight">
              Everything You Need to Run Your Pickleball Business
            </h2>
            <p className="mt-3 text-muted-foreground text-sm md:text-base">
              Eliminate double-booking conflicts, streamline front-desk cashiering, and keep players updated.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border bg-card hover:border-accent/50 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-2">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Real-Time Availability Grid</CardTitle>
                <CardDescription className="text-xs">
                  Hour-by-hour calendar per court updated every 15 seconds. Prevents overlapping bookings and keeps court slots visible.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border bg-card hover:border-accent/50 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center text-success mb-2">
                  <UserPlus className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Walk-In Front Desk POS</CardTitle>
                <CardDescription className="text-xs">
                  Process walk-in players on the spot at your counter. Accept Cash, GCash, or Card and issue instant reference numbers.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border bg-card hover:border-accent/50 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-2">
                  <Zap className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Automated Day &amp; Night Rates</CardTitle>
                <CardDescription className="text-xs">
                  Configure custom hourly pricing for daytime vs evening peak lighting hours. Total amounts auto-calculate instantly.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border bg-card hover:border-accent/50 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent mb-2">
                  <Megaphone className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Player Announcement Banners</CardTitle>
                <CardDescription className="text-xs">
                  Publish notices about court maintenance, tournament dates, or rain delays directly onto player booking screens.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border bg-card hover:border-accent/50 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center text-success mb-2">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Revenue &amp; Reservation Dashboard</CardTitle>
                <CardDescription className="text-xs">
                  Track paid vs pending income, total reservations across your courts, and walk-in vs online booking breakdowns.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border bg-card hover:border-accent/50 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-2">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">Venue Account Isolation</CardTitle>
                <CardDescription className="text-xs">
                  Each Davao venue account sees only its own courts, bookings, and revenue data. Master Admin panel controls master access.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Interactive Platform Demo */}
      <section id="demo" className="py-16 md:py-24 border-b border-border">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Platform Preview</p>
            <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight">
              Interactive Owner Suite Preview
            </h2>
            <p className="mt-3 text-muted-foreground text-sm">
              Explore how your venue dashboard and POS tools function in practice.
            </p>
          </div>

          <div className="mt-10 max-w-4xl mx-auto">
            <Tabs defaultValue="reservations" className="w-full">
              <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto p-1 bg-muted/60">
                <TabsTrigger value="reservations" className="py-2 text-xs font-medium">
                  <ReceiptText className="h-3.5 w-3.5 mr-1.5" /> Bookings
                </TabsTrigger>
                <TabsTrigger value="pos" className="py-2 text-xs font-medium">
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Walk-In POS
                </TabsTrigger>
                <TabsTrigger value="announcements" className="py-2 text-xs font-medium">
                  <Megaphone className="h-3.5 w-3.5 mr-1.5" /> Notices
                </TabsTrigger>
                <TabsTrigger value="rates" className="py-2 text-xs font-medium">
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" /> Rate Calculator
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Bookings */}
              <TabsContent value="reservations" className="mt-4">
                <Card className="border-border">
                  <CardHeader className="py-4 border-b border-border bg-muted/30 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">Live Reservations Console</CardTitle>
                      <CardDescription className="text-xs">Real-time table of reservations for your venue</CardDescription>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">Arena Athletics</Badge>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 border-b border-border text-muted-foreground">
                        <tr>
                          <th className="p-3 text-left">Ref #</th>
                          <th className="p-3 text-left">Court</th>
                          <th className="p-3 text-left">Time</th>
                          <th className="p-3 text-left">Player</th>
                          <th className="p-3 text-left">Channel</th>
                          <th className="p-3 text-left">Amount</th>
                          <th className="p-3 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr>
                          <td className="p-3 font-mono font-semibold">DVO-8921</td>
                          <td className="p-3">Court 1</td>
                          <td className="p-3">06:00 PM - 08:00 PM</td>
                          <td className="p-3 font-medium">Juan Dela Cruz</td>
                          <td className="p-3"><Badge variant="outline" className="text-[10px]">Online</Badge></td>
                          <td className="p-3 font-semibold">{formatPHP(500)}</td>
                          <td className="p-3"><Badge className="bg-success/15 text-success hover:bg-success/20 border-0">Paid</Badge></td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono font-semibold">DVO-8924</td>
                          <td className="p-3">Court 2</td>
                          <td className="p-3">07:00 PM - 09:00 PM</td>
                          <td className="p-3 font-medium">Maria Santos</td>
                          <td className="p-3"><Badge variant="secondary" className="text-[10px]">Walk-In</Badge></td>
                          <td className="p-3 font-semibold">{formatPHP(500)}</td>
                          <td className="p-3"><Badge className="bg-success/15 text-success hover:bg-success/20 border-0">Paid</Badge></td>
                        </tr>
                        <tr>
                          <td className="p-3 font-mono font-semibold">DVO-8930</td>
                          <td className="p-3">Court 1</td>
                          <td className="p-3">08:00 PM - 10:00 PM</td>
                          <td className="p-3 font-medium">Mark Tan</td>
                          <td className="p-3"><Badge variant="outline" className="text-[10px]">Online</Badge></td>
                          <td className="p-3 font-semibold">{formatPHP(500)}</td>
                          <td className="p-3"><Badge variant="outline" className="text-warning border-warning/40">Pending</Badge></td>
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 2: Walk-In POS */}
              <TabsContent value="pos" className="mt-4">
                <Card className="border-border">
                  <CardHeader className="py-4 border-b border-border bg-muted/30">
                    <CardTitle className="text-base font-semibold">Walk-in POS Cashiering Dialog</CardTitle>
                    <CardDescription className="text-xs">Front desk cash register for walk-in players</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Select Court</Label>
                        <Input value="Court 1 (Available)" readOnly className="bg-muted/30 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Payment Method</Label>
                        <div className="flex gap-2">
                          <Badge variant="default" className="cursor-pointer py-1.5 px-3">Cash</Badge>
                          <Badge variant="outline" className="cursor-pointer py-1.5 px-3">GCash</Badge>
                          <Badge variant="outline" className="cursor-pointer py-1.5 px-3">Card</Badge>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Player Name</Label>
                        <Input placeholder="Enter walk-in player name" className="text-xs" defaultValue="Pedro Penduko" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total Amount</Label>
                        <div className="text-lg font-bold text-primary">{formatPHP(250)} / hr</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 3: Announcements */}
              <TabsContent value="announcements" className="mt-4">
                <Card className="border-border">
                  <CardHeader className="py-4 border-b border-border bg-muted/30">
                    <CardTitle className="text-base font-semibold">Venue Announcements Broadcaster</CardTitle>
                    <CardDescription className="text-xs">Display banners on customer booking pages</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6 space-y-3">
                    <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 flex items-start gap-3">
                      <Megaphone className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-xs text-accent">Active Notice: Court 3 Maintenance</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Court 3 will be undergoing resurfacing this Friday from 8:00 AM to 12:00 PM. All other courts remain open.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 4: Rate Calculator */}
              <TabsContent value="rates" className="mt-4">
                <Card className="border-border">
                  <CardHeader className="py-4 border-b border-border bg-muted/30">
                    <CardTitle className="text-base font-semibold">Day vs Night Tier Calculator</CardTitle>
                    <CardDescription className="text-xs">Auto-calculates differential peak pricing</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-4 rounded-lg bg-muted/40 border border-border">
                        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Day Rate (06:00 - 18:00)</div>
                        <div className="text-2xl font-bold text-foreground mt-2">{formatPHP(200)} <span className="text-xs font-normal text-muted-foreground">/ hr</span></div>
                      </div>
                      <div className="p-4 rounded-lg bg-accent/10 border border-accent/20">
                        <div className="text-xs text-accent font-semibold uppercase tracking-wider">Night Peak (18:00 - 22:00)</div>
                        <div className="text-2xl font-bold text-accent mt-2">{formatPHP(250)} <span className="text-xs font-normal text-muted-foreground">/ hr</span></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>

      {/* Davao Venues Grid */}
      <section id="venues" className="py-16 md:py-24 border-b border-border bg-muted/20">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Davao Partner Venues</p>
            <h2 className="mt-3 font-display text-3xl md:text-4xl font-bold tracking-tight">
              Trusted by Davao City's Premier Pickleball Venues
            </h2>
            <p className="mt-3 text-muted-foreground text-sm">
              Connecting venue operators across Matina, Lanang, Buhangin, and Poblacion.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {davaoVenues.map(venue => (
              <Card key={venue} className="border-border bg-card p-4 text-center hover:shadow-sm transition-all">
                <div className="h-8 w-8 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto mb-2 font-bold text-xs">
                  {venue.charAt(0)}
                </div>
                <div className="font-semibold text-xs text-foreground truncate">{venue}</div>
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <MapPin className="h-3 w-3 text-accent" /> Davao City
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 md:py-24 border-b border-border">
        <div className="container max-w-3xl">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Frequently Asked Questions</p>
            <h2 className="mt-3 font-display text-3xl font-bold">Venue Owner FAQ</h2>
          </div>

          <div className="mt-10 space-y-4">
            <Card className="border-border p-5">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-accent shrink-0" /> How do per-venue owner accounts work?
              </h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Each court venue in Davao receives a dedicated login username (matching your venue name) and secure password. When signed in, staff members only see and manage your court schedule, rate tiers, and reservations.
              </p>
            </Card>

            <Card className="border-border p-5">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-accent shrink-0" /> How are walk-in players handled at front desk?
              </h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Staff can use the "New Walk-In Booking" POS modal on the owner portal to immediately reserve a court for on-the-spot players and record Cash, GCash, or Card payments.
              </p>
            </Card>

            <Card className="border-border p-5">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-accent shrink-0" /> Can we update day and night pricing rates?
              </h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Yes! Rate tiers can be customized per venue or managed via the Master Admin console to reflect specific daytime or peak evening light costs.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="py-16 bg-accent text-accent-foreground">
        <div className="container text-center max-w-2xl">
          <h2 className="font-display text-3xl font-bold">Ready to Manage Your Davao Court Facility?</h2>
          <p className="mt-3 text-accent-foreground/80 text-sm">
            Sign in with your venue credentials or request an account setup for your court location.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <Button size="lg" variant="secondary" className="press font-semibold" onClick={() => navigate("/owner-login")}>
              <KeyRound className="h-4 w-4 mr-2" /> Sign In to Owner Portal
            </Button>
            <Button size="lg" variant="outline" className="press bg-transparent text-white border-white/40 hover:bg-white/10" onClick={() => setInquiryOpen(true)}>
              <Store className="h-4 w-4 mr-2" /> Register Venue
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-background">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Davao Pickleball POS</span>
            <span>&bull; Owner Site &amp; Management System</span>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">Customer Site</Link>
            <Link href="/owner-login" className="hover:text-foreground transition-colors">Owner Sign In</Link>
            <Link href="/owner-app/admin" className="hover:text-foreground transition-colors">System Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
