import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { priceSlot, generateSlots } from "@shared/rates";
import { storageGet, storagePut } from "./storage";
import { sendBookingConfirmation } from "./resend";
import { createCheckoutSession, retrieveCheckoutSession } from "./paymongo";
import { settleBookingPaid } from "./settlement";

/**
 * How long a booking holds its court while the player pays.
 *
 * Long enough to finish a GCash flow on a phone with bad signal, short enough
 * that an abandoned checkout does not park a Saturday evening slot all day.
 */
const PENDING_HOLD_MS = 20 * 60 * 1000;

/**
 * Where PayMongo sends the player back to.
 *
 * Prefers APP_BASE_URL because the request host is whatever a proxy put there,
 * and a wrong value here sends a paying player to somebody else's site. The
 * throw is deliberate: no return address is better than a guessed one.
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

/** One-time alphanumeric password generated when a staff member is added. */
function randomOneTimePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

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

/**
 * Owner-scoped venue id resolution that stays correct for the master admin.
 * The master admin (ownsAllVenues) gets every venue; venue-bound owners keep
 * their session venue; legacy OAuth-sourced owners (role 'owner', type
 * 'customer') stay scoped to their venueOwners rows — an empty list there is
 * intentional and yields no data rather than system-wide data.
 */
async function ownedVenueIds(
  ctx: { ownsAllVenues: boolean } & Record<string, unknown>,
  venueId: number | undefined,
): Promise<number[]> {
  if (venueId) return [venueId];
  if (ctx.ownsAllVenues) {
    const venues = await db.listVenues();
    return venues.map(v => v.id);
  }
  return ctx.ownedVenueIds as number[];
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
  promoCodeId: z.number().int().positive().nullable().optional(),
  playerEmail: z.string().email().optional(),
});

type BookingInput = z.infer<typeof bookingInput>;

/** Shared booking creation logic (validation + pricing + insert). Used by both public and owner flows. */
async function createBookingInput(input: BookingInput): Promise<string> {
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

  const conflict = await db.findConflictingBooking(
    input.venueId,
    input.courtId,
    input.playerDate,
    input.startHour,
    input.endHour,
  );
  if (conflict) {
    throw new TRPCError({ code: "CONFLICT", message: "This slot is already booked" });
  }

  const tiers = await db.listRateTiersByVenue(input.venueId);
  const pricing = priceSlot(input.startHour, input.endHour, tiers);
  const reference = await db.generateReference();

  // Apply promo code discount if provided
  let promoCodeId: number | null = null;
  let discountAmount = 0;
  let finalTotal = pricing.total;
  if (input.promoCodeId != null) {
    const code = await db.getPromoCodeById(input.promoCodeId);
    if (!code || Number(code.venueId) !== Number(input.venueId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This promo code is not valid for this venue" });
    }
    if (!code.active) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This promo code has been deactivated" });
    }
    const now = Date.now();
    if (code.expiresAt && new Date(code.expiresAt).getTime() < now) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This promo code has expired" });
    }
    if (code.maxUses != null && code.uses >= Number(code.maxUses)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This promo code has reached its usage limit" });
    }
    const amount = pricing.total;
    if (code.minAmount != null && amount < Number(code.minAmount)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Minimum booking amount is ₱${Number(code.minAmount).toFixed(2)}` });
    }
    if (code.discountPct != null) {
      discountAmount = Math.round((amount * Number(code.discountPct)) / 100);
    } else if (code.discountFlat != null) {
      discountAmount = Number(code.discountFlat);
    }
    discountAmount = Math.min(discountAmount, amount);
    finalTotal = Math.round((amount - discountAmount) * 100) / 100;
    promoCodeId = code.id;
    await db.bumpPromoCodeUses(code.id);
  }

  await db.insertBooking({
    ...input,
    contact: input.contact ?? null,
    playerEmail: input.playerEmail ?? null,
    paymentMethod: input.paymentMethod ?? null,
    customerAccountId: input.customerAccountId ?? null,
    promoCodeId,
    discountAmount: String(discountAmount),
    reference,
    dayAmount: String(pricing.dayAmount),
    nightAmount: String(pricing.nightAmount),
    totalAmount: String(finalTotal),
    paymentStatus: input.paymentMethod ? "paid" : "pending",
  });

  // Best-effort confirmation email with the promo discount line. Never blocks.
  const emailTarget = input.playerEmail
    ? { to: input.playerEmail }
    : input.customerAccountId
      ? { to: (await db.getCustomerAccountById(input.customerAccountId))?.email ?? "" }
      : { to: "" };
  if (emailTarget.to) {
    const venueName = await db.getVenueById(input.venueId).then(v => v?.name ?? `Venue #${input.venueId}`);
    const courtNum = court.courtNumber ?? String(input.courtId);
    sendBookingConfirmation({
      playerName: input.playerName,
      to: emailTarget.to,
      reference,
      venueName,
      courtLabel: courtNum,
      playerDate: input.playerDate,
      startHour: input.startHour,
      endHour: input.endHour,
      totalAmount: finalTotal,
      discountAmount,
    });
  }
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
        const row = await db.getOwnerCredentialByUsername(input.username);
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
        const existing = await db.getCustomerAccountByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
        }
        const hash = await hashPassword(input.password);
        const accountId = await db.insertCustomerAccount({ email: input.email, name: input.name ?? null, passwordHash: hash });
        setCustomerCookie(ctx.res, accountId, input.email);
        return { success: true, accountId } as const;
      }),

    /** Customer app: optional account sign-in. */
    customerLogin: publicProcedure
      .input(z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const row = await db.getCustomerAccountByEmail(input.email);
        if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        setCustomerCookie(ctx.res, row.id, row.email);
        return { success: true } as const;
      }),
  }),

  venues: router({
    list: publicProcedure.query(() => db.listVenues()),

    /** Public: multi-photo gallery rows for a venue, ordered by sort order. */
    gallery: publicProcedure.input(z.object({ venueId: z.number().int().positive() })).query(({ input }) =>
      db.listGalleryByVenue(input.venueId),
    ),

    /** Admin-only: upload an image to the venue gallery. Accepts base64-encoded image bytes. */
    uploadGalleryImage: globalAdminProcedure
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
        const key = `venue-gallery/${input.venueId}-${Date.now()}-${safeName}`;
        const buffer = Buffer.from(input.base64, "base64");
        if (buffer.length > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be under 8 MB" });
        }
        const { key: storedKey } = await storagePut(key, buffer, input.mimeType);
        const existing = await db.listGalleryByVenue(input.venueId);
        const id = await db.insertGalleryRow({
          venueId: input.venueId,
          imageKey: storedKey,
          sortOrder: existing.length,
        });
        return { success: true, id, imageKey: storedKey } as const;
      }),

    /** Admin-only: remove a gallery image. */
    removeGalleryImage: globalAdminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => db.removeGalleryRow(input.id)),

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
        let ownerAccountId: number | null = null;
        if (!(await db.getOwnerCredentialByUsername(username))) {
          const hash = await hashPassword("Davao2026!");
          ownerAccountId = await db.insertOwnerCredential({ username, passwordHash: hash, venueId: created.venueId });
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

    /** Master admin only: remove a venue and its courts/rates/announcements/grants/gallery rows (blocked if it has upcoming or paid bookings). */
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

  bookings: router({
    /** Compute price without creating a booking (used by the POS form). */
    quote: publicProcedure.input(bookingInput).query(async ({ input }) => {
      const tiers = await db.listRateTiersByVenue(input.venueId);
      return priceSlot(input.startHour, input.endHour, tiers);
    }),

    /** Public: validate a promo code for a venue and compute the discounted total. */
    applyPromoCode: publicProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          code: z.string().min(3).max(32).trim(),
          amount: z.number().min(0),
        }),
      )
      .query(async ({ input }) => {
        const code = input.code.trim().toUpperCase();
        const venue = await db.getVenueById(input.venueId);
        if (!venue) {
          return { valid: false as const, reason: "Unknown venue", discount: 0, newTotal: input.amount };
        }
        const rows = await db.listPromoCodesByVenueIds([input.venueId]);
        const match = rows.find(c => c.code.toUpperCase() === code);
        if (!match) {
          return { valid: false as const, reason: "This promo code is not active at this venue", discount: 0, newTotal: input.amount };
        }
        if (!match.active) {
          return { valid: false as const, reason: "This promo code has been deactivated", discount: 0, newTotal: input.amount };
        }
        const now = Date.now();
        if (match.expiresAt && new Date(match.expiresAt).getTime() < now) {
          return { valid: false as const, reason: "This promo code has expired", discount: 0, newTotal: input.amount };
        }
        if (match.maxUses != null && match.uses >= Number(match.maxUses)) {
          return { valid: false as const, reason: "This promo code has reached its usage limit", discount: 0, newTotal: input.amount };
        }
        if (match.minAmount != null && input.amount < Number(match.minAmount)) {
          return {
            valid: false as const,
            reason: `Minimum booking amount is ₱${Number(match.minAmount).toFixed(2)}`,
            discount: 0,
            newTotal: input.amount,
          };
        }
        let discount = 0;
        if (match.discountPct != null) {
          discount = Math.round((input.amount * Number(match.discountPct)) / 100);
        } else if (match.discountFlat != null) {
          discount = Number(match.discountFlat);
        }
        discount = Math.min(discount, input.amount);
        return { valid: true as const, reason: null as string | null, discount, newTotal: Math.round((input.amount - discount) * 100) / 100 };
      }),
    /** Public: resolve a valid promo code's id for checkout booking linkage. */
    promoCodeId: publicProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          code: z.string().min(3).max(32).trim(),
        }),
      )
      .query(async ({ input }) => {
        const code = input.code.trim().toUpperCase();
        const rows = await db.listPromoCodesByVenueIds([input.venueId]);
        const match = rows.find(c => c.code.toUpperCase() === code);
        if (!match || !match.active) return { id: 0 };
        return { id: match.id };
      }),

    /** Create a booking (walk-in or online). Guests can book; signed-in customers get their account linked. */
    create: publicProcedure.input(bookingInput).mutation(async ({ input, ctx }) => {
      const accountId = ctx.user?.type === "customer" ? ctx.user.id : undefined;
      const reference = await createBookingInput({ ...input, customerAccountId: accountId });
      return { reference };
    }),

    markPaid: adminProcedure
      .input(z.object({ id: z.number().int().positive(), paymentMethod: z.string().max(32).optional() }))
      .mutation(async ({ input }) => {
        await db.updateBookingStatus(input.id, {
          paymentStatus: "paid",
          paymentMethod: input.paymentMethod ?? "cash",
        });
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

        if (patch.courtId || patch.playerDate || patch.startHour || patch.endHour) {
          const courtId = patch.courtId ?? booking.courtId;
          const playerDate = patch.playerDate ?? booking.playerDate;
          const startHour = patch.startHour ?? booking.startHour;
          const endHour = patch.endHour ?? booking.endHour;
          const conflict = await db.findConflictingBooking(booking.venueId, courtId, playerDate, startHour, endHour, id);
          if (conflict) {
            throw new TRPCError({ code: "CONFLICT", message: "The new slot is already booked" });
          }
        }

        const tiers = await db.listRateTiersByVenue(booking.venueId);
        const pricing = priceSlot(
          patch.startHour ?? booking.startHour,
          patch.endHour ?? booking.endHour,
          tiers,
        );

        await db.updateBookingStatus(id, {
          ...patch,
          dayAmount: String(pricing.dayAmount),
          nightAmount: String(pricing.nightAmount),
          totalAmount: String(pricing.total),
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

    /** Player: find my bookings by the contact/phone/email I booked with. */
    myBookings: playerProcedure
      .input(z.object({ identifier: z.string().min(3).max(128) }))
      .query(async ({ input }) => {
        const rows = await db.listPlayerBookings(input.identifier);
        const venueIds = Array.from(new Set(rows.map(r => r.venueId)));
        const venueRows = venueIds.length ? await db.listVenuesByIds(venueIds) : [];
        const venueMap = new Map(venueRows.map((v: { id: number }) => [v.id, v]));
        return rows.map(r => ({ booking: r, venue: venueMap.get(r.venueId) ?? null }));
      }),

    /** Customer account: all bookings made under the signed-in email. */
    myAccountBookings: customerAccountProcedure.query(async ({ ctx }) => {
      const email = ctx.user?.email;
      if (!email) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not signed in" });
      const rows = await db.listPlayerBookings(email);
      const venueIds = Array.from(new Set(rows.map(r => r.venueId)));
      const venueRows = venueIds.length ? await db.listVenuesByIds(venueIds) : [];
      const venueMap = new Map(venueRows.map((v: { id: number }) => [v.id, v]));
      return rows.map(r => ({ booking: r, venue: venueMap.get(r.venueId) ?? null }));
    }),

    /** Player: cancel my own booking (verified via booking id + identifier ownership). */
    cancelMine: playerProcedure
      .input(z.object({ id: z.number().int().positive(), identifier: z.string().min(3).max(128) }))
      .mutation(async ({ input }) => {
        const booking = await db.getBookingById(input.id);
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
        const identifier = input.identifier.trim();
        const mine =
          (booking.contact && booking.contact.includes(identifier)) ||
          booking.playerName.includes(identifier);
        if (!mine) throw new TRPCError({ code: "FORBIDDEN", message: "This booking is not yours" });
        await db.updateBookingStatus(input.id, { paymentStatus: "cancelled" });
        return { success: true } as const;
      }),
  }),

  /** Owner portal: manage the venues this owner owns. */
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

  owner: router({
    myVenues: ownerProcedure.query(async ({ ctx }) => {
      // Venue-specific owner logins see only their venue; the global owner
      // account ("owner") manages all venues system-wide.
      if (ctx.ownsAllVenues) return db.listVenues();
      const venueIds = (ctx.ownedVenueIds as number[]) || [];
      if (venueIds.length === 0) return [];
      const venue = await db.getVenueById(venueIds[0]);
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
        const courtIds = Array.from(new Set(rows.map(r => r.courtId)));
        const courtRows = courtIds.length ? await db.listCourtsByIds(courtIds) : [];
        const courtMap = new Map(courtRows.map((c: { id: number; courtNumber: string }) => [c.id, c.courtNumber]));
        return rows.map(r => ({ booking: r, venue: venueMap.get(r.venueId) ?? null, courtNumber: courtMap.get(r.courtId) ?? null }));
      }),

    markPaid: ownerProcedure
      .input(z.object({ id: z.number().int().positive(), paymentMethod: z.string().max(32).optional() }))
      .mutation(async ({ input, ctx }) => {
        const booking = await db.getBookingById(input.id);
        if (!booking || !ownsVenue(ctx, booking.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This booking is not at your venue" });
        }
        await db.updateBookingStatus(input.id, {
          paymentStatus: "paid",
          paymentMethod: input.paymentMethod ?? "cash",
        });
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
        // Free slot released — automatically mark the first not-yet-notified waitlister.
        const waitlisters = await db.listWaitlistForSlot(
          booking.venueId, booking.courtId, booking.playerDate, booking.startHour, booking.endHour,
        );
        const next = waitlisters.find(w => !w.notified);
        if (next) await db.markWaitlistNotified(next.id);
        return { success: true, waitlistNotified: Boolean(next) } as const;
      }),

    /** Owner: create a booking (owner reserves a court through the same flow). */
    createBooking: ownerProcedure.input(bookingInput).mutation(async ({ input, ctx }) => {
      const venue = await db.getVenueById(input.venueId);
      if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
      if (!ownsVenue(ctx, venue.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
      }
      // Reuse the public create flow by calling its inner mutation logic:
      const reference = await createBookingInput(input);
      return { reference } as const;
    }),

    /** Owner: live reviews feed across owned venues. */
    reviews: ownerProcedure
      .input(
        z
          .object({ venueId: z.number().int().positive().optional() })
          .optional(),
      )
      .query(async ({ input, ctx }) => {
        // If the owner narrowed to a venue, it must be one they own — no peeking
        // at other venues by guessing ids. Without a filter, default to all owned.
        // The master owner session (ownsAllVenues, no venue list) pulls every
        // review instead of falling through to an empty owned list.
        let rows: Awaited<ReturnType<typeof db.listReviewsForVenues>>;
        let stats: Awaited<ReturnType<typeof db.venueReviewStats>> | null;
        if (input?.venueId) {
          if (!ownsVenue(ctx, input.venueId)) {
            return { rows: [], stats: null } as const;
          }
          [rows, stats] = await Promise.all([
            db.listReviewsForVenues([input.venueId]),
            db.venueReviewStats(input.venueId),
          ]);
        } else if (ctx.ownsAllVenues) {
          rows = await db.listAllReviews();
          stats = null;
        } else {
          const ids = ownsVenuesList(ctx) ?? [];
          [rows, stats] = await Promise.all([
            db.listReviewsForVenues(ids),
            ids.length === 1 ? db.venueReviewStats(ids[0]) : Promise.resolve(null),
          ]);
        }
        return { rows, stats } as const;
      }),

    /* ── Review replies ── */
    replies: ownerProcedure
      .input(
        z.object({ venueId: z.number().int().positive().optional() }).optional(),
      )
      .query(async ({ input, ctx }) => {
        let reviewRows: Awaited<ReturnType<typeof db.listReviewsForVenues>>;
        if (input?.venueId) {
          if (!ownsVenue(ctx, input.venueId)) return { rows: [], replies: [] } as const;
          reviewRows = await db.listVenueReviews(input.venueId, 200);
        } else if (ctx.ownsAllVenues) {
          reviewRows = await db.listAllReviews(200);
        } else {
          reviewRows = await db.listReviewsForVenues(ownsVenuesList(ctx) ?? [], 200);
        }
        const scoped = reviewRows.filter(r => ownsVenue(ctx, r.venueId));
        const replies = await db.listRepliesForReviews(scoped.map(r => r.id));
        return { rows: scoped, replies } as const;
      }),
    createReply: ownerProcedure
      .input(z.object({ reviewId: z.number().int().positive(), body: z.string().min(1).max(1000).trim() }))
      .mutation(async ({ input, ctx }) => {
        const all = await db.listAllReviews(500);
        const review = all.find(r => r.id === input.reviewId);
        if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
        if (!ownsVenue(ctx, review.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        await db.deleteRepliesForReview(input.reviewId); // one reply per review — editing replaces
        await db.createReviewReply(input.reviewId, ctx.user!.id, input.body);
        return { success: true } as const;
      }),
    deleteReply: ownerProcedure
      .input(z.object({ reviewId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const all = await db.listAllReviews(500);
        const review = all.find(r => r.id === input.reviewId);
        if (!review) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
        if (!ownsVenue(ctx, review.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        await db.deleteRepliesForReview(input.reviewId);
        return { success: true } as const;
      }),
    /* ── Staff (multi-login per venue) ── */
    staff: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive().optional() }))
      .query(async ({ input, ctx }) => {
        const ids = await ownedVenueIds(ctx, input?.venueId);
        if (!ctx.ownsAllVenues && input?.venueId && !ownsVenue(ctx, input.venueId)) return [];
        return db.listVenueStaff(ids);
      }),
    addStaff: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive(), email: z.string().email().toLowerCase(), role: z.enum(["staff", "owner"]).default("staff") }))
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        const user = await db.getUserByEmail(input.email);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "No account found with that email — the staff member must sign in once first" });
        await db.setRole(user.id, "owner");
        await db.addStaff(user.id, input.venueId, input.role);
        await db.grantVenueOwnership(user.id, input.venueId);
        // Auto-provision an owner-portal login for the new staff member:
        // username = their email, one-time password returned to the inviter.
        const existingCred = await db.getOwnerCredentialByUsername(input.email);
        if (existingCred && existingCred.venueId === input.venueId) {
          return { success: true, userId: user.id, provisioned: false } as const;
        }
        const oneTimePassword = randomOneTimePassword();
        const hash = await hashPassword(oneTimePassword);
        await db.insertOwnerCredential({ username: input.email, passwordHash: hash, venueId: input.venueId });
        return { success: true, userId: user.id, provisioned: true, oneTimePassword, username: input.email } as const;
      }),
    removeStaff: ownerProcedure
      .input(z.object({ userId: z.number().int().positive(), venueId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        await db.removeStaff(input.userId, input.venueId);
        const remaining = await db.listOwnerVenueIds(input.userId);
        if (remaining.length === 0) await db.setRole(input.userId, "user");
        return { success: true } as const;
      }),
    /* ── Memberships ── */
    memberships: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        return db.listMembershipsWithAccounts(input.venueId);
      }),
    createMembership: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          name: z.string().min(1).max(64).trim(),
          description: z.string().max(500).trim().optional(),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Price must be a number"),
          credits: z.number().int().min(1).max(500).default(1),
          validityDays: z.number().int().min(1).max(730).default(30),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        await db.createMembership({
          venueId: input.venueId, name: input.name, description: input.description ?? null,
          price: input.price, credits: input.credits, validityDays: input.validityDays,
        });
        return { success: true } as const;
      }),
    deleteMembership: ownerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const venues = await db.listVenues();
        let foundVenueId: number | null = null;
        for (const v of venues) {
          const rows = await db.listMembershipsByVenue(v.id);
          if (rows.some(r => r.id === input.id)) { foundVenueId = v.id; break; }
        }
        if (!foundVenueId || !ownsVenue(ctx, foundVenueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this membership plan" });
        await db.deleteMembership(input.id);
        return { success: true } as const;
      }),
    sellMembership: ownerProcedure
      .input(z.object({ name: z.string().min(1).max(128).trim(), phone: z.string().max(32).optional(), membershipId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const venues = await db.listVenues();
        let foundVenueId: number | null = null;
        for (const v of venues) {
          const rows = await db.listMembershipsByVenue(v.id);
          if (rows.some(r => r.id === input.membershipId)) { foundVenueId = v.id; break; }
        }
        if (!foundVenueId || !ownsVenue(ctx, foundVenueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this membership plan" });
        const row = await db.createMemberAccount({ name: input.name, phone: input.phone ?? null, membershipId: input.membershipId });
        return { success: true, id: row.id, expiresAt: row.expiresAt } as const;
      }),
    /** Public: membership plans at a venue (players see them at checkout). */
    membershipsPublic: publicProcedure
      .input(z.object({ venueId: z.number().int().positive() }))
      .query(async ({ input }) => db.listMembershipsByVenue(input.venueId)),
    /* ── Reports (date range, revenue, occupancy, CSV export) ── */
    reports: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive().optional(),
          start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start must be YYYY-MM-DD"),
          end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End must be YYYY-MM-DD"),
        }),
      )
      .query(async ({ input, ctx }) => {
        const ids = await ownedVenueIds(ctx, input?.venueId);
        const rows = await db.listOwnerBookings(ids, { limit: 5000 });
        const scoped = rows.filter(b => ownsVenue(ctx, b.venueId) && b.playerDate >= input.start && b.playerDate <= input.end);
        const paid = scoped.filter(b => b.paymentStatus === "paid");
        const revenue = paid.reduce((sum, b) => sum + Number(b.totalAmount ?? 0), 0);
        const dayByDate: Record<string, { date: string; revenue: number; paidCount: number; pendingCount: number; slots: number }> = {};
        for (const b of scoped) {
          const d = dayByDate[b.playerDate] ??= { date: b.playerDate, revenue: 0, paidCount: 0, pendingCount: 0, slots: 0 };
          d.slots += 1;
          if (b.paymentStatus === "paid") { d.paidCount += 1; d.revenue += Number(b.totalAmount ?? 0); }
          if (b.paymentStatus === "pending") d.pendingCount += 1;
        }
        const days = Object.values(dayByDate).sort((a, b) => a.date.localeCompare(b.date));
        const csvLines = [
          "date,revenue,paid_bookings,pending_bookings,total_slots",
          ...days.map(d => `${d.date},${d.revenue.toFixed(2)},${d.paidCount},${d.pendingCount},${d.slots}`),
        ];
        return {
          revenue: Number(revenue.toFixed(2)),
          paidCount: paid.length, pendingCount: scoped.length - paid.length, totalBookings: scoped.length,
          days, csv: csvLines.join("\n"),
        } as const;
      }),
    /* ── Recurring bookings (series) ── */
    createSeries: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(), courtId: z.number().int().positive(),
          startHour: z.string().regex(/^\d{2}:\d{2}$/), endHour: z.string().regex(/^\d{2}:\d{2}$/),
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          weeks: z.number().int().min(1).max(52),
          weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), // 0=Sun..6=Sat
          playerName: z.string().min(1).max(128),
          contact: z.string().max(64).optional(),
          paymentMethod: z.string().max(32).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        const seriesId = `sr${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const created: string[] = [];
        const skipped: string[] = [];
        for (let w = 0; w < input.weeks; w += 1) {
          for (const wd of input.weekdays) {
            const d = new Date(`${input.startDate}T00:00:00+08:00`);
            d.setDate(d.getDate() + w * 7 + ((wd - d.getDay() + 7) % 7));
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const conflict = await db.findConflictingBooking(input.venueId, input.courtId, dateStr, input.startHour, input.endHour);
            if (conflict) { skipped.push(dateStr); continue; }
            const tiers = await db.listRateTiersByVenue(input.venueId);
            const pricing = priceSlot(input.startHour, input.endHour, tiers);
            const reference = await db.generateReference();
            await db.insertBooking({
              venueId: input.venueId, courtId: input.courtId, playerDate: dateStr,
              startHour: input.startHour, endHour: input.endHour, playerName: input.playerName,
              contact: input.contact ?? null, customerAccountId: null, channel: "walkin" as const,
              paymentMethod: input.paymentMethod ?? null, reference, seriesId,
              dayAmount: String(pricing.dayAmount), nightAmount: String(pricing.nightAmount),
              totalAmount: String(pricing.total), paymentStatus: input.paymentMethod ? "paid" : "pending",
            });
            created.push(dateStr);
          }
        }
        return { seriesId, createdCount: created.length, skippedCount: skipped.length, skipped } as const;
      }),
    /* ── Waitlist ── */
    waitlist: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        return db.listWaitlistForVenue(input.venueId);
      }),
    notifyWaitlist: ownerProcedure
      .input(z.object({ id: z.number().int().positive(), venueId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        await db.markWaitlistNotified(input.id);
        return { success: true } as const;
      }),
    dismissWaitlist: ownerProcedure
      .input(z.object({ id: z.number().int().positive(), venueId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        await db.removeFromWaitlist(input.id);
        return { success: true } as const;
      }),
    /* ── Notifications (unread booking bell) ── */
    notifications: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive().optional() }))
      .query(async ({ input, ctx }) => {
        const ids = await ownedVenueIds(ctx, input?.venueId);
        const count = await db.countUnreadBookings(ids);
        const rows = await db.listUnreadBookings(ids, 20);
        return { count, rows: rows.filter(b => ownsVenue(ctx, b.venueId)) } as const;
      }),
    markNotificationsRead: ownerProcedure
      .input(z.object({ venueId: z.number().int().positive().optional() }))
      .mutation(async ({ input, ctx }) => {
        const ids = await ownedVenueIds(ctx, input?.venueId);
        await db.markBookingsSeen(ids);
        return { success: true } as const;
      }),
    /** Owner: list announcements at owned venues (all, incl. inactive). */
    announcements: ownerProcedure
      .input(
        z
          .object({ venueId: z.number().int().positive().optional() })
          .optional(),
      )
      .query(async ({ input, ctx }) => {
        const ids = await ownedVenueIds(ctx, input?.venueId);
        const rows = (await db.listVenueAnnouncements(ids)).filter(a => ownsVenue(ctx, a.venueId));
        // Attach RSVP headcount + latest attendee names to every announcement.
        const byAnn = await db.listAttendanceByAnnouncementIds(rows.map(r => r.id));
        return rows.map(a => ({
          ...a,
          rsvpCount: (byAnn[a.id] ?? []).length,
          recentAttendees: (byAnn[a.id] ?? []).slice(0, 3).map(r => String(r.playerName ?? "")),
          attendees: byAnn[a.id] ?? [],
        }));
      }),
    /** Owner: full attendee list for an event at an owned venue. */
    announcementAttendees: ownerProcedure
      .input(z.object({ announcementId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const ann = await db.getAnnouncementById(input.announcementId);
        if (!ann || !ownsVenue(ctx, ann.venueId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Announcement not found at your venue" });
        }
        return (await db.listAttendanceByAnnouncementIds([ann.id]))[ann.id] ?? [];
      }),

    createAnnouncement: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          title: z.string().min(1).max(160),
          message: z.string().min(1),
          expireAt: z.string().datetime().nullable().optional(),
          photoUrl: z.string().max(512).nullable().optional(),
          kind: z.enum(["announcement", "promotion", "event"]).default("announcement"),
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
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
          photoUrl: input.photoUrl ?? null,
          kind: input.kind,
          eventDate: input.eventDate ?? null,
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
          photoUrl: z.string().max(512).nullable().optional(),
          kind: z.enum(["announcement", "promotion", "event"]).optional(),
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...patch } = input;
        const all = await db.listVenueAnnouncements(await ownedVenueIds(ctx, undefined));
        const row = all.find(a => a.id === id);
        if (!row) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This announcement is not at your venue" });
        }
        const set: Record<string, unknown> = {};
        if (patch.title !== undefined) set.title = patch.title.trim();
        if (patch.message !== undefined) set.message = patch.message.trim();
        if (patch.active !== undefined) set.active = patch.active;
        if (patch.expireAt !== undefined) set.expireAt = patch.expireAt ? new Date(patch.expireAt) : null;
        if (patch.photoUrl !== undefined) set.photoUrl = patch.photoUrl;
        if (patch.kind !== undefined) set.kind = patch.kind;
        if (patch.eventDate !== undefined) set.eventDate = patch.eventDate;
        await db.updateAnnouncement(id, set);
        return { success: true } as const;
      }),

    deleteAnnouncement: ownerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const all = await db.listVenueAnnouncements(await ownedVenueIds(ctx, undefined));
        const row = all.find(a => a.id === input.id);
        if (!row) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This announcement is not at your venue" });
        }
        await db.deleteAnnouncement(input.id);
        return { success: true } as const;
      }),

    /** Owner: upload a promo image (stores to S3, returns the URL to use as announcement photoUrl). */
    uploadPromoImage: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().regex(/^image\/(png|jpe?g|webp)$/),
          base64: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `promo-images/${input.venueId}-${Date.now()}-${safeName}`;
        const buffer = Buffer.from(input.base64, "base64");
        if (buffer.length > 8 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be under 8 MB" });
        }
        const { key: storedKey } = await storagePut(key, buffer, input.mimeType);
        const { url: imageUrl } = await storageGet(storedKey);
        return { success: true, imageKey: storedKey, imageUrl } as const;
      }),

    /** Owner: promo code management for owned venues. */
    promoCodes: ownerProcedure
      .input(
        z
          .object({ venueId: z.number().int().positive().optional() })
          .optional(),
      )
      .query(async ({ input, ctx }) => {
        const ids = input?.venueId
          ? [input.venueId]
          : ownsVenuesList(ctx) ?? (await db.listVenues()).map(v => v.id);
        const rows = await db.listPromoCodesByVenueIds(ids);
        return rows.filter(c => ownsVenue(ctx, c.venueId));
      }),

    createPromoCode: ownerProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          code: z.string().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/),
          discountPct: z.number().min(0).max(100).nullable().optional(),
          discountFlat: z.number().min(0).nullable().optional(),
          minAmount: z.number().min(0).nullable().optional(),
          maxUses: z.number().int().min(1).nullable().optional(),
          expiresAt: z.string().datetime().nullable().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (!ownsVenue(ctx, input.venueId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this venue" });
        }
        if (input.discountPct == null && input.discountFlat == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Set either a percentage or a flat discount" });
        }
        const existing = (await db.listPromoCodesByVenueIds([input.venueId])).find(
          c => c.code.toLowerCase() === input.code.toLowerCase(),
        );
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "A promo code with this code already exists at this venue" });
        }
        await db.createPromoCode({
          venueId: input.venueId,
          code: input.code.toUpperCase(),
          discountPct: input.discountPct != null ? String(input.discountPct) : null,
          discountFlat: input.discountFlat != null ? String(input.discountFlat) : null,
          minAmount: input.minAmount != null ? String(input.minAmount) : null,
          maxUses: input.maxUses ?? null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          active: 1,
        });
        return { success: true } as const;
      }),

    updatePromoCode: ownerProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          active: z.number().int().min(0).max(1).optional(),
          maxUses: z.number().int().min(1).nullable().optional(),
          minAmount: z.number().min(0).nullable().optional(),
          expiresAt: z.string().datetime().nullable().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...patch } = input;
        const all = await db.listPromoCodesByVenueIds(await ownedVenueIds(ctx, undefined));
        const row = all.find(c => c.id === id);
        if (!row) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This promo code is not at your venue" });
        }
        const set: Record<string, unknown> = {};
        if (patch.active !== undefined) set.active = patch.active;
        if (patch.maxUses !== undefined) set.maxUses = patch.maxUses;
        if (patch.minAmount !== undefined) set.minAmount = patch.minAmount ?? null;
        if (patch.expiresAt !== undefined) set.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
        await db.updatePromoCode(id, set);
        return { success: true } as const;
      }),

    deletePromoCode: ownerProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const all = await db.listPromoCodesByVenueIds(await ownedVenueIds(ctx, undefined));
        const row = all.find(c => c.id === input.id);
        if (!row) {
          throw new TRPCError({ code: "FORBIDDEN", message: "This promo code is not at your venue" });
        }
        await db.deletePromoCode(input.id);
        return { success: true } as const;
      }),
  }),

  /** Public announcements visible to players. */
  waitlist: router({
    /** Public: a player joins the waitlist for a fully-booked slot. */
    join: publicProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(), courtId: z.number().int().positive(),
          playerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          startHour: z.string().regex(/^\d{2}:\d{2}$/), endHour: z.string().regex(/^\d{2}:\d{2}$/),
          playerName: z.string().min(1).max(128).trim(), contact: z.string().max(64).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const venue = await db.getVenueById(input.venueId);
        if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        const court = (await db.listCourtsByVenue(input.venueId)).find(c => c.id === input.courtId);
        if (!court) throw new TRPCError({ code: "NOT_FOUND", message: "Court not found" });
        // Prefer waitlisting on genuinely full slots (a confirmed booking exists) — but
        // also allow it if no conflict at all? A waitlist for an empty slot is pointless:
        // require the slot to already be booked.
        const conflict = await db.findConflictingBooking(input.venueId, input.courtId, input.playerDate, input.startHour, input.endHour);
        if (!conflict) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This slot is still open — book it directly instead" });
        }
        const existing = await db.listWaitlistForSlot(input.venueId, input.courtId, input.playerDate, input.startHour, input.endHour);
        if (existing.some(w => String(w.playerName).toLowerCase().trim() === input.playerName.toLowerCase().trim())) {
          throw new TRPCError({ code: "CONFLICT", message: "You are already on the waitlist for this slot" });
        }
        const row = await db.joinWaitlist(input);
        return { success: true, id: row.id, position: existing.length + 1 } as const;
      }),
    /** Public: find waitlist entries by player name (used by My Bookings). */
    mine: publicProcedure
      .input(z.object({ playerName: z.string().min(1).max(128) }))
      .query(async ({ input }) => db.listMyWaitlist(input.playerName)),
  }),

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
  events: router({
    /** Public: RSVP to an event announcement (or cancel). Idempotent by player name. */
    toggleRsvp: publicProcedure
      .input(
        z.object({
          announcementId: z.number().int().positive(),
          playerName: z.string().min(1).max(128).trim(),
          contact: z.string().max(64).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const ann = await db.getAnnouncementById(input.announcementId);
        if (!ann || ann.kind !== "event" || !ann.active) {
          throw new TRPCError({ code: "NOT_FOUND", message: "This event is no longer active" });
        }
        const result = await db.toggleAttendance({
          announcementId: input.announcementId,
          playerName: input.playerName,
          contact: input.contact ?? null,
        });
        return { joined: result.joined, count: result.count } as const;
      }),
    /** Public: RSVP counts (+ attendee list) for given announcements. */
    attendance: publicProcedure
      .input(z.object({ announcementIds: z.array(z.number().int().positive()) }))
      .query(async ({ input }) => db.listAttendanceByAnnouncementIds(input.announcementIds)),
  }),
  reviews: router({
    /** Public: reviews for a venue, or all reviews when no venue given. */
    list: publicProcedure
      .input(z.object({ venueId: z.number().int().positive() }).optional())
      .query(async ({ input }) => {
        if (input?.venueId) return db.listVenueReviews(input.venueId);
        return db.listAllReviews();
      }),

    /** Public: rating stats for a venue, or all venues when no venue given. */
    stats: publicProcedure
      .input(z.object({ venueId: z.number().int().positive().optional() }).optional())
      .query(async ({ input }) => {
        if (input?.venueId) return db.venueReviewStats(input.venueId);
        return db.allVenueReviewStats();
      }),

    /** Public: submit a review (guest players too); bookingRef is optional proof of a visit. */
    create: publicProcedure
      .input(
        z.object({
          venueId: z.number().int().positive(),
          playerName: z.string().min(1).max(64).trim(),
          playerEmail: z.string().email().optional(),
          rating: z.number().int().min(1).max(5),
          comment: z.string().min(1).max(1000).trim(),
          bookingRef: z.string().max(32).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const venue = await db.getVenueById(input.venueId);
        if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        let bookingRefId: number | null = null;
        if (input.bookingRef) {
          const booking = await db.getBookingByReference(input.bookingRef);
          if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking reference not found" });
          if (booking.venueId !== input.venueId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Booking is not for this venue" });
          }
          bookingRefId = booking.id;
        }
        await db.createReview({
          venueId: input.venueId, playerName: input.playerName,
          playerEmail: input.playerEmail ?? null, rating: input.rating,
          comment: input.comment, bookingRef: bookingRefId,
        });
        return { success: true } as const;
      }),

    /** Public: owner replies attached to a list of reviews. */
    replies: publicProcedure
      .input(z.object({ reviewIds: z.array(z.number().int().positive()) }))
      .query(async ({ input }) => db.listRepliesForReviews(input.reviewIds)),
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
      const rows = await db.listAllOwnerCredentials();
      const list = rows.map(r => ({
        id: Number(r.id),
        username: String(r.username),
        venueId: r.venueId != null ? Number(r.venueId) : null,
        createdAt: new Date(r.createdAt as string),
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
        if (await db.getOwnerCredentialByUsername(username)) {
          throw new TRPCError({ code: "CONFLICT", message: "An owner account with this username already exists" });
        }
        if (input.venueId != null) {
          const venue = await db.getVenueById(input.venueId);
          if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        }
        const hash = await hashPassword(input.password);
        const id = await db.insertOwnerCredential({ username, passwordHash: hash, venueId: input.venueId ?? null });
        return { success: true, id } as const;
      }),

    /** Admin-only (global master only): change an owner account's password. */
    setOwnerAccountPassword: globalAdminProcedure
      .input(z.object({ id: z.number().int().positive(), password: z.string().min(8).max(128) }))
      .mutation(async ({ input }) => {
        if (!(await db.getOwnerCredentialById(input.id))) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found" });
        }
        const hash = await hashPassword(input.password);
        await db.updateOwnerCredential(input.id, { passwordHash: hash });
        return { success: true } as const;
      }),

    /** Admin-only (global master only): reassign which venue an owner account manages. */
    setOwnerAccountVenue: globalAdminProcedure
      .input(z.object({ id: z.number().int().positive(), venueId: z.number().int().positive().nullish() }))
      .mutation(async ({ input }) => {
        const row = await db.getOwnerCredentialById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found" });
        if (String(row.username).toLowerCase() === "owner" && input.venueId != null) {
          throw new TRPCError({ code: "FORBIDDEN", message: "The master admin account cannot be bound to a single venue" });
        }
        if (input.venueId != null) {
          const venue = await db.getVenueById(input.venueId);
          if (!venue) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
        }
        await db.updateOwnerCredential(input.id, { venueId: input.venueId ?? null });
        return { success: true } as const;
      }),

    /** Admin-only (global master only): delete an owner account (cannot delete the master admin account). */
    deleteOwnerAccount: globalAdminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const row = await db.getOwnerCredentialById(input.id);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Owner account not found" });
        if (String(row.username).toLowerCase() === "owner") {
          throw new TRPCError({ code: "FORBIDDEN", message: "The master admin account cannot be deleted" });
        }
        await db.deleteOwnerCredential(input.id);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
