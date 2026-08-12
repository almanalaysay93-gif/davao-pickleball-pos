import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const venueAccounts = [
  { name: "Arena Athletics", hint: "arena athletics" },
  { name: "Southside Davao", hint: "southside davao" },
  { name: "Matina Town Square", hint: "matina town square" },
  { name: "Paddle Up Davao", hint: "paddle up davao" },
  { name: "CrisRon", hint: "crisron" },
  { name: "PickleVille", hint: "pickleville" },
  { name: "Durian Pickleball House", hint: "durian pickleball house" },
  { name: "929 Pickleyard", hint: "929 pickleyard" },
];

export default function OwnerLogin() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ownerLogin = trpc.auth.ownerLogin.useMutation({
    onSuccess: () => {
      toast.success("Signed in to the owner portal");
      navigate("/owner-app");
    },
    onError: err => toast.error(err.message || "Invalid credentials"),
    onSettled: () => setSubmitting(false),
  });

  return (
    <div className="container py-16 md:py-24 fade-in">
      <div className="max-w-md mx-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent text-center">
          Owner portal
        </p>
        <h1 className="mt-3 text-3xl font-display font-semibold text-balance text-center">
          Venue owner sign-in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground text-center">
          Manage your courts, rates, bookings, and announcements.
        </p>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Your username is your court's name — or tap below to fill it in.
        </div>
        <div className="mt-2 flex justify-center">
          <Select
            value={username || undefined}
            onValueChange={v => setUsername(v)}>
            <SelectTrigger className="w-full max-w-md bg-background" aria-label="Select your venue">
              <SelectValue placeholder="Quick select your venue account" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {venueAccounts.map(v => (
                <SelectItem key={v.name} value={v.name}>
                  {v.name}
                </SelectItem>
              ))}
              <SelectItem value="owner">
                owner <span className="text-muted-foreground">(system admin)</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="mt-8 border-border bg-card">
          <CardHeader>
            <CardTitle className="sr-only">Owner sign in</CardTitle>
            <CardDescription className="sr-only">
              Enter the owner username and password provided by the system administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="owner-username">Username</Label>
              <Input
                id="owner-username"
                autoComplete="username"
                placeholder="owner"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="owner-password">Password</Label>
              <Input
                id="owner-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="px-6 pb-6">
            <Button
              className="w-full press"
              disabled={submitting || !username || !password}
              onClick={() => {
                setSubmitting(true);
                ownerLogin.mutate({ username: username.trim(), password });
              }}>
              {submitting ? "Signing in…" : (
                <>
                  <KeyRound className="h-4 w-4" /> Sign in
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Only authorized venue owners may use this portal.
        </p>
      </div>
    </div>
  );
}
