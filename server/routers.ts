import { TRPCError } from "@trpc/server";
import { z } from "zod";
import mysql from "mysql2/promise";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { priceSlot, generateSlots } from "@shared/rates";
import { storagePut } from "./storage";
import {
  createCheckoutSession,
  retrieveCheckoutSession,
} from "./paymongo";
import { rethrowBookingWriteError, settleBookingPaid, withBookingWrite } from "./settlement";

import {
  clearAuthCookies,
  hashPassword,
  setCustomerCookie,
  setOwnerCookie,
  verifyPassword,
  type AppUser,
} from "./auth";

/** Stricter gate: only the global master owner (session with no venueId) may pass.
 *  Session-based owners (type 'owner') with venueId == null own all venues;
 *  venue-bound owners carry a venueId in their session; legacy OAuth-based
 *  owners (type 'customer') are never system admins here. */
const globalAdminProcedure = publicProcedure.use(({ ctx, next }) => {
  const user = ctx.user as (AppUser & { venueId?: number | null }) | undefined;
  const sessionVenueId = user?.venueId;
  const ownsAllVenues = user?.type === "owner" && sessionVenueId == null;
  if (!ownsAllVenues) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Master admin access required" });
  }
  return next({ ctx });
});

let pool: mysql.Pool | null = null;
export function getAuthPool(): mysql.Pool {
  if (!pool && process.env.DATABASE_URL) pool = mysql.createPool(process.env.DATABASE_URL);
  return pool!;
}

/** Test accessor for the auth pool (used by vitest suites). */
export function getAuthPoolForTests(): mysql.Pool {
  return getAuthPool();
}

const adminProcedure = publicProcedure.use(({ ctx, next }) => {
  // The owner portal's fixed password login covers system admin duties.
  if (!ctx.user || ctx.user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

const playerProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" });
  }
  return next({ ctx });
});

const customerAccountProcedure = publicProcedure.use(({ ctx, next }) => {
  // Optional customer accounts in the customer app (email/password).
  if (!ctx.user || ctx.user.type !== "customer") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Customer sign in required" });
  }
  return next({ ctx });
});

const ownerProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Venue owner access required" });
  }
  // Venue-specific owner logins carry the venueId in their session. The
  // global "owner" account (no venueId) manages all venues system-wide.
  // Legacy OAuth-sourced owners (type 'customer', role 'owner') stay scoped
  // to their venueOwners rows for backward compatibility.
  const sessionVenueId = (ctx.user as AppUser & { venueId?: number | null }).venueId;
  const ownsAllVenues = sessionVenueId == null && ctx.user.type === "owner";
  const ownedVenueIds: number[] = sessionVenueId
    ? [sessionVenueId]
    : await db.listOwnerVenueIds(ctx.user.id);
  return next({ ctx: { ...ctx, ownsAllVenues, ownedVenueIds } });
});

function ownsVenue(ctx: { ownsAllVenues: boolean } & Record<string, unknown>, venueId: number): boolean {
  return ctx.ownsAllVenues || (ctx.ownedVenueIds as number[]).includes(venueId);
}

function ownsVenuesList(ctx: { ownsAllVenues: boolean } & Record<string, unknown>): number[] | undefined {
  return ctx.ownsAllVenues ? undefined : (ctx.ownedVenueIds as number[]);
}

const bookingInput = z.object({
  venueId: z.number().int().positive(),
  courtId: z.number().int().positive(),
  playerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  startHour: z.string().regex(/^\d{2}:\d{2}$/, "Start hour must be HH:MM"),
  endHour: z.string().regex(/^\d{2}:\d{2}$/, "End hour must be HH:MM"),
  playerName: z.string().min(1).max(128),
  contact: z.string().max(64).optional(),
  channel: z.enum(["online", "walkin"]).default("online"),
  paymentMethod: z.string().max(32).optional(),
  customerAccountId: z.number().int().positive().optional(),
});

type BookingInput = z.infer<typeof bookingInput>;

/**
 * How much the caller is trusted to settle money.
 *
 * "counter" is staff working an authenticated POS session, so cash really did
 * change hands and the booking is paid on creation. "public" is anyone on the
 * internet, whose channel and paymentMethod are only claims. A public booking
 * is always pending until a payment provider confirms it.
 */
type BookingTrust = "public" | "counter";

/**
 * How long an unpaid booking may hold its court. Without a deadline a player
 * who never pays keeps the slot off the market forever.
 */
const PENDING_HOLD_MS = 20 * 60 * 1000;

/** Pair each booking with its venue, in one query rather than one per row. */
async function attachVenues<T extends { venueId: number }>(rows: T[]) {
  const venueIds = Array.from(new Set(rows.map(r => r.venueId)));
  const venueRows = venueIds.length ? await db.listVenuesByIds(venueIds) : [];
  const venueMap = new Map(venueRows.map((v: { id: number }) => [v.id, v]));
  return rows.map(r => ({ booking: r, venue: venueMap.get(r.venueId) ?? null }));
}

/**
 * Settle a booking as paid, refusing the ones that have already let go of
 * their court.
 *
 * A cancelled or expired booking contributes no activeSlot key, so its court is
 * back on the market and another player may already hold it. Forcing the row
 * back to paid rebuilds that key and the unique index rejects it, which reaches
 * the venue as a raw driver error rather than anything they can act on.
 * Re-marking a paid booking stays allowed, because staff double-clicking a
 * button should not be an error.
 *
 * The status is read again under the court lock rather than trusted from
 * before it. Between staff opening the screen and pressing the button the hold
 * can lapse, the sweep can release the court, and another player can take it.
 * A check made outside the lock describes a court that was free, not one that
 * still is.
 */

/**
 * Where PayMongo should send the player back to.
 *
 * APP_BASE_URL wins when it is set, and in production it should be. The
 * fallback reads the Host header, which the caller controls, so a poisoned
 * Host would put an attacker's address on the page the payer lands on after
 * paying. Nothing here trusts the return for payment state - only the gateway
 * decides that - but the player still has to arrive somewhere real.
 */
function baseUrl(req: { protocol?: string; headers?: Record<string, unknown> } | undefined): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = req?.headers?.host;
  if (typeof host !== "string" || !host) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "APP_BASE_URL is not configured, so the payment return address cannot be built.",
    });
  }
  return `${req?.protocol ?? "https"}://${host}`;
}

/** Shared booking creation logic (validation + pricing + insert). Used by both public and owner flows. */
async function createBookingInput(input: BookingInput, trust: BookingTrust): Promise<string> {
  // Validate court belongs to venue
  const courts = await db.listCourtsByVenue(input.venueId);
  const court = courts.find(c => c.id === input.courtId);
  if (!court) throw new TRPCError({ code: "NOT_FOUND", message: "Court not found" });
  if (court.status === "maintenance") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Court is under maintenance" });
  }

  // Validate date is not in the past (Asia/Manila)
  const todayManila = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }),
  );
  const dateStr = `${todayManila.getFullYear()}-${String(todayManila.getMonth() + 1).padStart(2, "0")}-${String(todayManila.getDate()).padStart(2, "0")}`;
  if (input.playerDate < dateStr) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot book a past date" });
  }

  // Validate slot is within venue hours
  const venue = await db.getVenueById(input.venueId);
  if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
  const slots = generateSlots(venue.openTime, venue.closeTime);
  if (!slots.includes(input.startHour)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid time slot for this venue" });
  }

  const tiers = await db.listRateTiersByVenue(input.venueId);
  const pricing = priceSlot(input.startHour, input.endHour, tiers);

  const settledAtCounter = trust === "counter" && Boolean(input.paymentMethod);
  const reference = await db.generateReference();

  // Everything that decides whether this court is free, and the write that
  // acts on that decision, belongs inside one lock. Split apart, two players
  // asking for overlapping hours both read a free court and both get it.
  await withBookingWrite(input.courtId, "This slot is already booked", async tx => {
    // Release lapsed holds first, so an abandoned checkout does not keep the
    // court off the market. Scoped to this court-day: sweeping the whole table
    // while holding this lock would take row locks on courts this transaction
    // has no claim to, and two venues booking at once would deadlock.
    await db.expireStaleHolds(new Date(), { courtId: input.courtId, playerDate: input.playerDate }, tx);

    const conflict = await db.findConflictingBooking(
      input.venueId,
      input.courtId,
      input.playerDate,
      input.startHour,
      input.endHour,
      undefined,
      tx,
    );
    if (conflict.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "This slot is already booked" });
    }

    await db.insertBooking({
      ...input,
      contact: input.contact ?? null,
      // A public caller cannot describe how it paid, because it has not paid yet.
      paymentMethod: settledAtCounter ? input.paymentMethod! : null,
      customerAccountId: input.customerAccountId ?? null,
      reference,
      dayAmount: String(pricing.dayAmount),
      nightAmount: String(pricing.nightAmount),
      totalAmount: String(pricing.total),
      paymentStatus: settledAtCounter ? "paid" : "pending",
      expiresAt: settledAtCounter ? null : new Date(Date.now() + PENDING_HOLD_MS),
    }, tx);
    // The lock rules out a competing booking for this court-day, so a
    // duplicate key here would mean the unique index caught something the
    // overlap check did not. withBookingWrite reports it as the conflict it is
    // rather than letting a driver error carrying SQL reach the venue.
  });

  return reference;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    logout: publicProcedure.mutation(({ ctx }) => {
      clearAuthCookies(ctx.res);
      return { success: true } as const;
    }),

    /** Owner portal: fixed-credential sign in. */
    ownerLogin: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const [rows] = await getAuthPool().query(
          "SELECT id, username, passwordHash, venueId FROM ownerCredentials WHERE username = ? LIMIT 1",
          [input.username],
        );
        const row = (rows as any[])[0];
        if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid owner credentials" });
        }
        setOwnerCookie(ctx.res, row.username, row.id, row.venueId ?? null);
        return { success: true, username: row.username } as const;
      }),

    /** Owner sign out. */
    ownerLogout: publicProcedure.mutation(({ ctx }) => {
      clearAuthCookies(ctx.res);
      return { success: true } as const;
    }),

    /** Customer app: optional account sign-up. */
    signup: publicProcedure
      .input(
        z.object({
          email: z.string().email().toLowerCase().max(320),
          name: z.string().min(1).max(128).optional(),
          password: z.string().min(8).max(128),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const [existing] = await getAuthPool().query(
          "SELECT id FROM customerAccounts WHERE email = ?",
          [input.email],
        );
        if ((existing as any[]).length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
        }
        const hash = await hashPassword(input.password);
        const [res] = await getAuthPool().query(
          "INSERT INTO customerAccounts (email, name, passwordHash) VALUES (?, ?, ?)",
          [input.email, input.name ?? null, hash],
        );
        const accountId = (res as any).insertId;
        setCustomerCookie(ctx.res, accountId, input.email);
        return { success: true, accountId } as const;
      }),

    /** Customer app: optional account sign-in. */
    customerLogin: publicProcedure
      .input(z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const [rows] = await getAuthPool().query(
          "SELECT id, email, name, passwordHash FROM customerAccounts WHERE email = ? LIMIT 1",
          [input.email],
        );
        const row = (rows as any[])[0];
        if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        setCustomerCookie(ctx.res, row.id, row.email);
        return { success: true } as const;
      }),
  }),

  venues: router({
    list: publicProcedure.query(() => db.listVenues()),

    /** Master admin only: create an entire venue with its courts and rate tiers. */
    create: globalAdminProcedure
      .input(
        z.object({
          name: z.string().min(1).max(128).trim(),
          address: z.string().min(1).trim(),
          district: z.string().max(64).trim().optional(),
          surfaceType: z.enum(["indoor", "outdoor", "covered"]).default("indoor"),
          openTime: z.string().regex(/^\d{2}:\d{2}$/),
          closeTime: z.string().regex(/^\d{2}:\d{2}$/),
          phone: z.string().max(32).trim().optional(),
          description: z.string().max(2000).optional(),
          courtCount: z.number().int().min(1).max(20).default(1),
          dayRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
          nightRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
          imageKey: z.string().max(1024).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const rates: Parameters<typeof db.createVenue>[2] = [];
        if (input.dayRate && input.nightRate) {
          rates.push({ tierName: "daytime", startHour: input.openTime, endHour: "18:00", pricePerHour: input.dayRate });
          rates.push({ tierName: "nighttime", startHour: "18:00", endHour: input.closeTime, pricePerHour: input.nightRate });
        } else if (input.dayRate) {
          rates.push({ tierName: "daytime", startHour: input.openTime, endHour: input.closeTime, pricePerHour: input.dayRate });
        }
        const created = await db.createVenue(input, input.courtCount, rates);
        // Automatically create a venue owner login so the new venue is immediately manageable.
        // The username is the venue name; master login conflict is impossible because
        // venues.create is already blocked from using the name "owner" (duplicate name guard).
        const username = input.name.toLowerCase();
        const [existing] = await getAuthPool().query(
          "SELECT id FROM ownerCredentials WHERE username = ? LIMIT 1",
          [username],
        );
        let ownerAccountId: number | null = null;
        if ((existing as any[]).length === 0) {
          const hash = await hashPassword("Davao2026!");
          const [res] = await getAuthPool().query(
            "INSERT INTO ownerCredentials (username, passwordHash, venueId) VALUES (?, ?, ?)",
            [username, hash, created.venueId],
          );
          ownerAccountId = (res as any).insertId;
        }
        return { ...created, ownerAccount: ownerAccountId ? { username, password: "Davao2026!" } : null };
      }),

    /** Master admin only: edit venue details. */
    update: globalAdminProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          name: z.string().min(1).max(128).trim().optional(),
          address: z.string().min(1).trim().optional(),
          district: z.string().max(64).trim().optional(),
          surfaceType: z.enum(["indoor", "outdoor", "covered"]).optional(),
          openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          phone: z.string().max(32).trim().optional(),
          description: z.string().max(2000).optional(),
          imageKey: z.string().max(1024).optional().nullable(),
        }),
      )
      .mutation(async ({ input }) => {
        const { venueId, ...rest } = input;
        return db.updateVenue(venueId, rest);
      }),

    /** Admin-only: upload a venue image to storage. Accepts base64-encoded image bytes. */
    uploadVenueImage: globalAdminProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().regex(/^image\/(png|jpe?g|webp)$/),
          base64: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const venue = await db.getVenueById(input.venueId);
        if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `venue-images/${input.venueId}-${Date.now()}-${safeName}`;
        const buffer = Buffer.from(input.base64, "base64");
        if (buffer.length > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be under 8 MB" });
        }
        const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType);
        // Point the venue at the new image.
        await db.updateVenue(input.venueId, { imageKey: storedKey });
        return { success: true, imageKey: storedKey, url } as const;
      }),

    /** Master admin only: remove a venue and its courts/rates/announcements/grants (blocked if it has upcoming or paid bookings). */
    delete: globalAdminProcedure
      .input(z.object({ venueId: z.number().int().positive() }))
      .mutation(async ({ input }) => db.deleteVenue(input.venueId)),
  }),

  courts: router({
    byVenue: publicProcedure.input(z.object({ venueId: z.number().int().positive() })).query(({ input }) =>
      db.listCourtsByVenue(input.venueId),
    ),
  }),

  rates: router({
    byVenue: publicProcedure.input(z.object({ venueId: z.number().int().positive() })).query(({ input }) =>
      db.listRateTiersByVenue(input.venueId),
    ),
    all: publicProcedure.query(() => db.listRateTiers()),
  }),

  availability: router({
    /** Hourly availability grid for a venue on a given date (Asia/Manila). */
    forVenueDate: publicProcedure
      .input(z.object({ venueId: z.number().int().positive(), playerDate: z.string() }))
      .query(async ({ input }) => {
        const venue = await db.getVenueById(input.venueId);
        if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });

        // Release lapsed holds first, or the grid keeps showing an abandoned
        // checkout as a taken slot.
        await db.expireStaleHolds();

        const [courts, tiers, bookingsList] = await Promise.all([
          db.listCourtsByVenue(input.venueId),
          db.listRateTiersByVenue(input.venueId),
          db.listBookingsForVenueDate(input.venueId, input.playerDate),
        ]);

        const slots = generateSlots(venue.openTime, venue.closeTime);

        // Build occupied map: courtId -> set of slot start hours
        const occupied = new Map<number, Set<string>>();
        for (const b of bookingsList) {
          let s = db.toMinutesForSlot(b.startHour);
          const e = db.toMinutesForSlot(b.endHour);
          const set = occupied.get(b.courtId) ?? new Set<string>();
          for (let t = s; t + 60 <= e; t += 60) set.add(db.hhmmFromMinutes(t));
          occupied.set(b.courtId, set);
        }

        return {
          venue,
          slots,
          courts: courts.map(c => ({
            ...c,
            occupied: Array.from(occupied.get(c.id) ?? []),
            down: c.status === "maintenance",
          })),
          bookings: bookingsList,
          tiers,
        };
      }),
  }),

  /**
   * Online payment through PayMongo.
   *
   * Split from bookings on purpose: these two procedures are the only place
   * the app talks to a payment gateway, and the booking router should not grow
   * a second reason to change. Neither procedure ever takes the browser's word
   * for whether money moved. startCheckout opens a session, sync reads one
   * back, and PayMongo is the only source of "paid" in both.
   */
  payments: router({
    /**
     * Open (or reopen) the hosted checkout for a pending booking.
     *
     * Public, because the player who just booked as a guest has no session.
     * The booking reference is the only key, and it is the same secret the
     * confirmation page already shows them.
     */
    startCheckout: publicProcedure
      .input(z.object({ reference: z.string().min(4).max(32) }))
      .mutation(async ({ input, ctx }) => {
        const booking = await db.getBookingByReference(input.reference);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
        if (booking.paymentStatus === "paid") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This booking is already paid." });
        }
        if (booking.paymentStatus !== "pending") {
          // Taking money for a court this booking no longer holds is the one
          // outcome a later status change cannot repair, so the gateway is not
          // called at all.
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `This booking is ${booking.paymentStatus} and has released its court. Book again to pay.`,
          });
        }

        const holdUntil = new Date(Date.now() + PENDING_HOLD_MS);

        // A player who clicks pay twice must land back on the session they may
        // already have paid on. Opening a second one would leave the first
        // payable and unwatched, and sync only ever knows the newest id.
        if (booking.paymongoSessionId) {
          const existing = await retrieveCheckoutSession(booking.paymongoSessionId).catch(() => null);
          if (existing && existing.status === "active" && existing.checkoutUrl) {
            await db.attachCheckoutSession(booking.id, existing.id, holdUntil);
            return { checkoutUrl: existing.checkoutUrl } as const;
          }
        }

        const venue = await db.getVenueById(booking.venueId);
        const base = baseUrl(ctx.req);
        const session = await createCheckoutSession({
          booking: {
            id: booking.id,
            reference: booking.reference,
            playerName: booking.playerName,
            totalAmount: String(booking.totalAmount),
            venueName: venue?.name ?? "Pickleball court",
            playerDate: booking.playerDate,
            startHour: booking.startHour,
            endHour: booking.endHour,
          },
          successUrl: `${base}/confirmation/${booking.reference}`,
          cancelUrl: `${base}/confirmation/${booking.reference}?cancelled=1`,
        });

        await db.attachCheckoutSession(booking.id, session.id, holdUntil);
        return { checkoutUrl: session.checkoutUrl } as const;
      }),

    /**
     * Ask PayMongo what happened, and settle the booking if money landed.
     *
     * The return page calls this because the webhook may not have arrived yet,
     * or may never arrive. It is a mutation rather than a query because it
     * writes, and it is safe to repeat: settleBookingPaid already allows
     * re-marking a booking that is paid.
     */
    sync: publicProcedure
      .input(z.object({ reference: z.string().min(4).max(32) }))
      .mutation(async ({ input }) => {
        const booking = await db.getBookingByReference(input.reference);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

        // Nothing to reconcile: either it is settled, or no checkout was ever
        // opened, and calling the gateway would answer a question nobody asked.
        if (booking.paymentStatus === "paid" || !booking.paymongoSessionId) {
          return { paymentStatus: booking.paymentStatus, paidButReleased: false } as const;
        }

        const session = await retrieveCheckoutSession(booking.paymongoSessionId);
        if (!session.paid) {
          return { paymentStatus: booking.paymentStatus, paidButReleased: false } as const;
        }

        if (booking.paymentStatus !== "pending") {
          // Money arrived for a court this booking already released. Forcing
          // the row back to paid rebuilds its slot key and collides with
          // whoever took the court, so the state is reported instead. The
          // venue refunds or rebooks from here; the app must not pretend the
          // court is held.
          console.error(
            `[payments] booking ${booking.reference} was paid at PayMongo but is ${booking.paymentStatus}. Refund or rebook needed.`,
          );
          return { paymentStatus: booking.paymentStatus, paidButReleased: true } as const;
        }

        await settleBookingPaid(booking.id, session.paidMethod ?? "gcash");
        return { paymentStatus: "paid", paidButReleased: false } as const;
      }),
  }),

  bookings: router({
    /** Compute price without creating a booking (used by the POS form). */
    quote: publicProcedure.input(bookingInput).query(async ({ input }) => {
      const tiers = await db.listRateTiersByVenue(input.venueId);
      return priceSlot(input.startHour, input.endHour, tiers);
    }),

    /** Create a booking (walk-in or online). Guests can book; signed-in customers get their account linked. */
    create: publicProcedure.input(bookingInput).mutation(async ({ input, ctx }) => {
      const accountId = ctx.user?.type === "customer" ? ctx.user.id : undefined;
      const reference = await createBookingInput({ ...input, customerAccountId: accountId }, "public");
      return { reference };
    }),

    markPaid: adminProcedure
      .input(z.object({ id: z.number().int().positive(), paymentMethod: z.string().max(32).optional() }))
      .mutation(async ({ input }) => {
        await settleBookingPaid(input.id, input.paymentMethod ?? "cash");
        return { success: true } as const;
      }),

    cancel: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await db.updateBookingStatus(input.id, { paymentStatus: "cancelled" });
        return { success: true } as const;
      }),

    modify: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          courtId: z.number().int().positive().optional(),
          playerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          startHour: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          endHour: z.string().regex(/^\d{2}:\d{2}$/).optional(),
          playerName: z.string().min(1).max(128).optional(),
          contact: z.string().max(64).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const { id, ...patch } = input;
        const booking = await db.getBookingById(id);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

        const tiers = await db.listRateTiersByVenue(booking.venueId);
        const pricing = priceSlot(
          patch.startHour ?? booking.startHour,
          patch.endHour ?? booking.endHour,
          tiers,
        );
        const amounts = {
          dayAmount: String(pricing.dayAmount),
          nightAmount: String(pricing.nightAmount),
          totalAmount: String(pricing.total),
        };

        // Renaming the player or correcting a contact number leaves the
        // booking on the court-hour it already holds, so there is nothing to
        // contend over and no reason to take a lock for it.
        const movesSlot = Boolean(patch.courtId || patch.playerDate || patch.startHour || patch.endHour);
        if (!movesSlot) {
          try {
            await db.updateBookingStatus(id, { ...patch, ...amounts });
          } catch (err) {
            rethrowBookingWriteError(err, "The new slot is already booked");
          }
          return { success: true, pricing } as const;
        }

        const courtId = patch.courtId ?? booking.courtId;
        const playerDate = patch.playerDate ?? booking.playerDate;
        const startHour = patch.startHour ?? booking.startHour;
        const endHour = patch.endHour ?? booking.endHour;

        // A move is a booking that happens to already exist, so it needs what
        // creating one needs. Read the destination, decide, and write inside a
        // single hold on the court, or a booking created between the check and
        // the write takes the slot this move just claimed.
        //
        // Only the destination court is locked. The court being left behind is
        // losing a booking, and nothing can go wrong by freeing a slot. Taking
        // both locks would need an ordering rule to stay deadlock-free, and
        // would buy nothing for it.
        await withBookingWrite(courtId, "The new slot is already booked", async tx => {
          // Same reason as on create: an abandoned checkout whose hold lapsed
          // still produces a slot key, and would refuse this move for a court
          // nobody holds any more.
          await db.expireStaleHolds(new Date(), { courtId, playerDate }, tx);

          const conflict = await db.findConflictingBooking(
            booking.venueId,
            courtId,
            playerDate,
            startHour,
            endHour,
            id,
            tx,
          );
          if (conflict.length > 0) {
            throw new TRPCError({ code: "CONFLICT", message: "The new slot is already booked" });
          }

          await db.updateBookingStatus(id, { ...patch, ...amounts }, tx);
        });

        return { success: true, pricing } as const;
      }),

    /** Toggle court operational status (available/maintenance). */
    setCourtStatus: adminProcedure
      .input(
        z.object({
          courtId: z.number().int().positive(),
          status: z.enum(["available", "maintenance"]),
        }),
      )
      .mutation(async ({ input }) => {
        await db.setCourtStatus(input.courtId, input.status);
        return { success: true } as const;
      }),

    /** Admin: add a new court to a venue. */
    createCourt: adminProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          courtNumber: z.string().min(1).max(16).trim(),
        }),
      )
      .mutation(async ({ input }) => {
        const venue = await db.getVenueById(input.venueId);
        if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        await db.addCourt(input.venueId, input.courtNumber);
        return { success: true } as const;
      }),

    /** Admin: remove a court (only if it has no upcoming bookings). */
    removeCourt: adminProcedure
      .input(z.object({ courtId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const court = await db.getCourtById(input.courtId);
        if (!court) throw new TRPCError({ code: "NOT_FOUND", message: "Court not found" });
        await db.removeCourt(input.courtId);
        return { success: true } as const;
      }),

    list: adminProcedure
      .input(
        z
          .object({
            channel: z.enum(["online", "walkin"]).optional(),
            limit: z.number().int().positive().max(500).optional(),
          })
          .optional(),
      )
      .query(({ input }) => db.listAllBookings(input)),

    get: publicProcedure.input(z.object({ reference: z.string().min(1) })).query(async ({ input }) => {
      const booking = await db.getBookingByReference(input.reference);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      const venue = await db.getVenueById(booking.venueId);
      const courtsList = await db.listCourtsByVenue(booking.venueId);
      const court = courtsList.find(c => c.id === booking.courtId);
      return { booking, venue, court };
    }),

    /**
     * Guest: find the booking I made without an account.
     *
     * Public on purpose. Requiring sign-in here protected nothing, because
     * anyone can register a customer account in a few seconds, and it broke
     * the flow it guarded: the guest lookup screen is shown only to signed-out
     * visitors, so every call it made answered 401. What guards the data is
     * the exact-match rule in listGuestBookings, not the session.
     *
     * The minimum length is the width of a booking reference. A full phone
     * number clears it too; a fragment of one does not.
     */
    myBookings: publicProcedure
      .input(z.object({ identifier: z.string().min(6).max(128) }))
      .query(async ({ input }) => {
        const rows = await db.listGuestBookings(input.identifier);
        return attachVenues(rows);
      }),

    /** Customer account: every booking made while signed in to this account. */
    myAccountBookings: customerAccountProcedure.query(async ({ ctx }) => {
      const accountId = ctx.user?.id;
      if (!accountId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
      const rows = await db.listAccountBookings(accountId);
      return attachVenues(rows);
    }),

    /** Player: cancel my own booking. */
    cancelMine: publicProcedure
      .input(z.object({ id: z.number().int().positive(), identifier: z.string().min(6).max(128) }))
      .mutation(async ({ input, ctx }) => {
        const booking = await db.getBookingById(input.id);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
        const identifier = input.identifier.trim();

        // Two ways to own a booking: the session it was made in, or a secret
        // the holder carries. The previous test was contact.includes(identifier),
        // which passed for '09' against every Philippine mobile number, so any
        // caller could cancel every booking in the table by walking the id
        // sequence. Substrings decide nothing here now.
        const ownedByAccount =
          ctx.user?.type === "customer" && booking.customerAccountId === ctx.user.id;
        const ownedBySecret =
          booking.reference.toLowerCase() === identifier.toLowerCase() ||
          booking.contact === identifier;
        if (!ownedByAccount && !ownedBySecret) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This booking is not yours" });
        }

        await db.updateBookingStatus(input.id, { paymentStatus: "cancelled" });
        return { success: true } as const;
      }),
  }),

  /** Owner portal: manage the venues this owner owns. */
  owner: router({
    myVenues: ownerProcedure.query(async ({ ctx }) => {
      // Venue-specific owner logins see only their venue; the global owner
      // account ("owner") manages all venues system-wide.
      if (ctx.ownsAllVenues) return db.listVenues();
      const venue = await db.getVenueById(ctx.ownedVenueIds[0]);
      return venue ? [venue] : [];
    }),

    courtsForVenue: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        return db.listCourtsByVenue(input.venueId);
      }),

    ratesForVenue: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        return db.listRateTiersByVenue(input.venueId);
      }),

    updateRateTier: ownerProcedure
      .input(
        z.object({
          tierId: z.number().int().positive(),
          pricePerHour: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price"),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const tiers = await db.listRateTiers();
        const tier = tiers.find(t => t.id === input.tierId);
        if (!tier) throw new TRPCError({ code: "NOT_FOUND", message: "Rate tier not found" });
        if (!ownsVenue(ctx, tier.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        await db.updateRateTier(input.tierId, { pricePerHour: input.pricePerHour });
        return { success: true } as const;
      }),

    setCourtStatus: ownerProcedure
      .input(
        z.object({
          courtId: z.number().int().positive(),
          status: z.enum(["available", "maintenance"]),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const court = await db.getCourtById(input.courtId);
        if (!court) throw new TRPCError({ code: "NOT_FOUND", message: "Court not found" });
        if (!ownsVenue(ctx, court.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        await db.setCourtStatus(input.courtId, input.status);
        return { success: true } as const;
      }),

    /** Owner: add a new court to an owned venue. */
    createCourt: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          courtNumber: z.string().min(1).max(16).trim(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        await db.addCourt(input.venueId, input.courtNumber);
        return { success: true } as const;
      }),

    /** Owner: remove a court from an owned venue (only if no upcoming bookings). */
    removeCourt: ownerProcedure
      .input(z.object({ courtId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const court = await db.getCourtById(input.courtId);
        if (!court) throw new TRPCError({ code: "NOT_FOUND", message: "Court not found" });
        if (!ownsVenue(ctx, court.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        await db.removeCourt(input.courtId);
        return { success: true } as const;
      }),

    bookings: ownerProcedure
      .input(
        z
          .object({
            channel: z.enum(["online", "walkin"]).optional(),
            limit: z.number().int().positive().max(500).optional(),
          })
          .optional(),
      )
      .query(async ({ input, ctx }) => {
        const venueIds = ownsVenuesList(ctx) ?? (await db.listVenues()).map(v => v.id);
        const rows = await db.listOwnerBookings(venueIds, input);
        const resultVenueIds = Array.from(new Set(rows.map(r => r.venueId)));
        const venueRows = resultVenueIds.length ? await db.listVenuesByIds(resultVenueIds) : [];
        const venueMap = new Map(venueRows.map((v: { id: number }) => [v.id, v]));
        return rows.map(r => ({ booking: r, venue: venueMap.get(r.venueId) ?? null }));
      }),

    markPaid: ownerProcedure
      .input(z.object({ id: z.number().int().positive(), paymentMethod: z.string().max(32).optional() }))
      .mutation(async ({ input, ctx }) => {
        const booking = await db.getBookingById(input.id);
        if (!booking || !ownsVenue(ctx, booking.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This booking is not at your venue" });
        }
        await settleBookingPaid(input.id, input.paymentMethod ?? "cash");
        return { success: true } as const;
      }),

    cancel: ownerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const booking = await db.getBookingById(input.id);
        if (!booking || !ownsVenue(ctx, booking.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This booking is not at your venue" });
        }
        await db.updateBookingStatus(input.id, { paymentStatus: "cancelled" });
        return { success: true } as const;
      }),

    /** Owner: create a booking (owner reserves a court through the same flow). */
    createBooking: ownerProcedure.input(bookingInput).mutation(async ({ input, ctx }) => {
      const venue = await db.getVenueById(input.venueId);
      if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
      if (!ownsVenue(ctx, venue.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
      }
      // Reuse the public create flow by calling its inner mutation logic:
      const reference = await createBookingInput(input, "counter");
      return { reference } as const;
    }),

    /** Owner: list announcements at owned venues (all, incl. inactive). */
    announcements: ownerProcedure
      .input(
        z
          .object({ venueId: z.number().int().positive().optional() })
          .optional(),
      )
      .query(async ({ input, ctx }) => {
        const ids = input?.venueId
          ? [input.venueId]
          : ownsVenuesList(ctx) ?? [];
        const rows = await db.listVenueAnnouncements(ids);
        return rows.filter(a => ownsVenue(ctx, a.venueId));
      }),

    createAnnouncement: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          title: z.string().min(1).max(160),
          message: z.string().min(1),
          expireAt: z.string().datetime().nullable().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        await db.createAnnouncement({
          venueId: input.venueId,
          title: input.title.trim(),
          message: input.message.trim(),
          active: 1,
          expireAt: input.expireAt ? new Date(input.expireAt) : null,
        });
        return { success: true } as const;
      }),

    updateAnnouncement: ownerProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          title: z.string().min(1).max(160).optional(),
          message: z.string().min(1).optional(),
          active: z.number().int().min(0).max(1).optional(),
          expireAt: z.string().datetime().nullable().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...patch } = input;
        const all = await db.listVenueAnnouncements(ownsVenuesList(ctx) ?? []);
        const row = all.find(a => a.id === id);
        if (!row) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This announcement is not at your venue" });
        }
        const set: Record<string, unknown> = {};
        if (patch.title !== undefined) set.title = patch.title.trim();
        if (patch.message !== undefined) set.message = patch.message.trim();
        if (patch.active !== undefined) set.active = patch.active;
        if (patch.expireAt !== undefined) set.expireAt = patch.expireAt ? new Date(patch.expireAt) : null;
        await db.updateAnnouncement(id, set);
        return { success: true } as const;
      }),

    deleteAnnouncement: ownerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const all = await db.listVenueAnnouncements(ownsVenuesList(ctx) ?? []);
        const row = all.find(a => a.id === input.id);
        if (!row) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This announcement is not at your venue" });
        }
        await db.deleteAnnouncement(input.id);
        return { success: true } as const;
      }),
  }),

  /** Public announcements visible to players. */
  announcements: router({
    list: publicProcedure
      .input(
        z
          .object({ venueId: z.number().int().positive().optional() })
          .optional(),
      )
      .query(async ({ input }) => {
        const ids = input?.venueId ? [input.venueId] : undefined;
        return db.listActiveAnnouncements(ids);
      }),
  }),

  /** Admin-only: assign venue ownership to a signed-in user by email. */
  admin: router({
    grantOwnership: adminProcedure
      .input(z.object({ venueId: z.number().int().positive(), email: z.string().email() }))
      .mutation(async ({ input }) => {
        const venue = await db.getVenueById(input.venueId);
        if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        const dbResult = await db.getUserByEmail(input.email);
        if (!dbResult) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No account found with that email — the owner must sign in once first" });
        }
        await db.grantVenueOwnership(dbResult.id, input.venueId);
        return { success: true } as const;
      }),

    /** Admin-only: list all venue ownership assignments. */
    owners: adminProcedure.query(async () => db.listAllOwners()),

    /** Admin-only (global master only): list all owner credential accounts. */
    ownerAccounts: globalAdminProcedure.query(async () => {
      const [rows] = await getAuthPool().query(
        "SELECT id, username, venueId, createdAt FROM ownerCredentials ORDER BY id ASC",
      );
      const list = (rows as any[]).map((r) => ({
        id: Number(r.id),
        username: String(r.username),
        venueId: r.venueId != null ? Number(r.venueId) : null,
        createdAt: new Date(r.createdAt),
      }));
      // Attach venue names for display.
      const venues = await db.listVenues();
      return { accounts: list, venues: venues ?? [] } as const;
    }),

    /** Admin-only (global master only): create a new venue owner login. */
    createOwnerAccount: globalAdminProcedure
      .input(
        z.object({
          username: z.string().trim().min(1).max(64),
          password: z.string().min(8).max(128),
          venueId: z.number().int().positive().nullish(),
        }),
      )
      .mutation(async ({ input }) => {
        const username = input.username.toLowerCase();
        if (username === "owner") {
          throw new TRPCError({ code: "CONFLICT", message: "This username is reserved for the master admin account" });
        }
        const [existing] = await getAuthPool().query(
          "SELECT id FROM ownerCredentials WHERE username = ? LIMIT 1",
          [username],
        );
        if ((existing as any[]).length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "An owner account with this username already exists" });
        }
        if (input.venueId != null) {
          const venue = await db.getVenueById(input.venueId);
          if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        }
        const hash = await hashPassword(input.password);
        const [res] = await getAuthPool().query(
          "INSERT INTO ownerCredentials (username, passwordHash, venueId) VALUES (?, ?, ?)",
          [username, hash, input.venueId ?? null],
        );
        return { success: true, id: (res as any).insertId } as const;
      }),

    /** Admin-only (global master only): change an owner account's password. */
    setOwnerAccountPassword: globalAdminProcedure
      .input(z.object({ id: z.number().int().positive(), password: z.string().min(8).max(128) }))
      .mutation(async ({ input }) => {
        const [existing] = await getAuthPool().query(
          "SELECT id FROM ownerCredentials WHERE id = ? LIMIT 1",
          [input.id],
        );
        if ((existing as any[]).length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found" });
        }
        const hash = await hashPassword(input.password);
        await getAuthPool().query("UPDATE ownerCredentials SET passwordHash = ? WHERE id = ?", [
          hash,
          input.id,
        ]);
        return { success: true } as const;
      }),

    /** Admin-only (global master only): reassign which venue an owner account manages. */
    setOwnerAccountVenue: globalAdminProcedure
      .input(z.object({ id: z.number().int().positive(), venueId: z.number().int().positive().nullish() }))
      .mutation(async ({ input }) => {
        const [existing] = await getAuthPool().query(
          "SELECT id, username FROM ownerCredentials WHERE id = ? LIMIT 1",
          [input.id],
        );
        const row = (existing as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found" });
        if (String(row.username).toLowerCase() === "owner" && input.venueId != null) {
          throw new TRPCError({ code: "FORBIDDEN", message: "The master admin account cannot be bound to a single venue" });
        }
        if (input.venueId != null) {
          const venue = await db.getVenueById(input.venueId);
          if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        }
        await getAuthPool().query("UPDATE ownerCredentials SET venueId = ? WHERE id = ?", [
          input.venueId ?? null,
          input.id,
        ]);
        return { success: true } as const;
      }),

    /** Admin-only (global master only): delete an owner account (cannot delete the master admin account). */
    deleteOwnerAccount: globalAdminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const [existing] = await getAuthPool().query(
          "SELECT id, username FROM ownerCredentials WHERE id = ? LIMIT 1",
          [input.id],
        );
        const row = (existing as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found" });
        if (String(row.username).toLowerCase() === "owner") {
          throw new TRPCError({ code: "FORBIDDEN", message: "The master admin account cannot be deleted" });
        }
        await getAuthPool().query("DELETE FROM ownerCredentials WHERE id = ?", [input.id]);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
