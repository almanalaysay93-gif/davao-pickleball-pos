import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { BadgeCheck, LogIn, UserPlus } from "lucide-react";

export default function CustomerLogin() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  // Sign in
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siSubmitting, setSiSubmitting] = useState(false);
  const customerLogin = trpc.auth.customerLogin.useMutation({
    onSuccess: () => {
      toast.success("Welcome back!");
      navigate("/my-bookings");
    },
    onError: err => toast.error(err.message || "Could not sign in"),
    onSettled: () => setSiSubmitting(false),
  });

  // Sign up
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suSubmitting, setSuSubmitting] = useState(false);
  const signup = trpc.auth.signup.useMutation({
    onSuccess: () => {
      toast.success("Account created — your bookings are now linked to you");
      navigate("/my-bookings");
    },
    onError: err => toast.error(err.message || "Could not create account"),
    onSettled: () => setSuSubmitting(false),
  });

  return (
    <div className="container py-14 md:py-20 fade-in">
      <div className="max-w-md mx-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent text-center">
          Player account
        </p>
        <h1 className="mt-3 text-3xl font-display font-semibold text-balance text-center">
          Your pickleball profile
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-center">
          Booking is open to everyone — an account is optional. Signing in keeps
          your bookings in one place.
        </p>

        <Card className="mt-8 border-border bg-card">
          <CardHeader>
            <CardTitle className="sr-only">Player account</CardTitle>
            <CardDescription className="sr-only">Sign in or create an account</CardDescription>
          </CardHeader>
          <CardContent className="px-6">
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Email</Label>
                  <Input
                    id="si-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={siEmail}
                    onChange={e => setSiEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="si-password">Password</Label>
                  <Input
                    id="si-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={siPassword}
                    onChange={e => setSiPassword(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="signup" className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="su-name">Name (optional)</Label>
                  <Input
                    id="su-name"
                    placeholder="Juan dela Cruz"
                    value={suName}
                    onChange={e => setSuName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">Email</Label>
                  <Input
                    id="su-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={suEmail}
                    onChange={e => setSuEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-password">Password</Label>
                  <Input
                    id="su-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={suPassword}
                    onChange={e => setSuPassword(e.target.value)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="px-6 pb-6">
            {activeTab === "signin" ? (
              <Button
                className="w-full press"
                disabled={siSubmitting || !siEmail || !siPassword}
                onClick={() => {
                  setSiSubmitting(true);
                  customerLogin.mutate({ email: siEmail.trim().toLowerCase(), password: siPassword });
                }}>
                {siSubmitting ? "Signing in…" : (
                  <>
                    <LogIn className="h-4 w-4" /> Sign in
                  </>
                )}
              </Button>
            ) : (
              <Button
                className="w-full press"
                disabled={suSubmitting || !suEmail || suPassword.length < 8}
                onClick={() => {
                  setSuSubmitting(true);
                  signup.mutate({
                    email: suEmail.trim().toLowerCase(),
                    name: suName.trim() || undefined,
                    password: suPassword,
                  });
                }}>
                {suSubmitting ? "Creating account…" : (
                  <>
                    <UserPlus className="h-4 w-4" /> Create account
                  </>
                )}
              </Button>
            )}
          </CardFooter>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            No account? That's fine — you can{" "}
            <button className="font-medium text-primary underline underline-offset-2" onClick={() => navigate("/book")}>
              book a court right away as a guest
            </button>.
          </p>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" />
            Your email only appears on your receipt and booking record.
          </p>
        </div>
      </div>
    </div>
  );
}
