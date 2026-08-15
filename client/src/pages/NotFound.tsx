import { Button } from "@/components/ui/button";
import { CalendarDays, Home, LayoutGrid } from "lucide-react";
import { Link } from "wouter";
import CustomerLayout from "../components/CustomerLayout";
import { usePageMeta } from "@/lib/meta";

/**
 * Themed 404 — beats the competitor's broken 404 dead-ends: a pickleball-pun
 * page with helpful CTAs so a lost visitor always has an escape route.
 */
export default function NotFound() {
  usePageMeta({
    title: "Page Not Found — Davao Pickleball POS",
    description:
      "The page you're looking for went out of bounds. Browse courts and book a slot in Davao City.",
  });

  return (
    <CustomerLayout>
      <div className="container py-14 max-w-lg mx-auto text-center fade-in">
        {/* Pickleball "out of bounds" mark */}
        <div className="relative mx-auto mb-8 h-32 w-32">
          <div
            className="absolute inset-0 rounded-full border-4 border-dashed border-primary/40 animate-spin"
            style={{ animationDuration: "14s" }}
          />
          <div className="absolute inset-4 rounded-full bg-[#f6eedb] border border-[#d8cfae] flex items-center justify-center shadow-inner">
            <span className="text-4xl" role="img" aria-label="pickleball">
              🎾
            </span>
          </div>
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Out of bounds
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight mt-2">
          This page went long.
        </h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Looks like this shot sailed past the baseline — the page you're looking for
          doesn't exist, was moved, or never made it onto the court.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <Link href="/">
            <Button variant="outline" className="w-full h-12">
              <Home className="h-4 w-4 mr-2" /> Home
            </Button>
          </Link>
          <Link href="/schedule">
            <Button variant="outline" className="w-full h-12">
              <CalendarDays className="h-4 w-4 mr-2" /> Schedule
            </Button>
          </Link>
        </div>
        <div className="mt-3">
          <Link href="/book">
            <Button className="w-full h-12">
              <LayoutGrid className="h-4 w-4 mr-2" /> Book a court now
            </Button>
          </Link>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Fun fact: the first pickleball court was drawn with chalk in a driveway on
          Bainbridge Island, Washington, in 1965.
        </p>
      </div>
    </CustomerLayout>
  );
}
