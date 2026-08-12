import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { priceSlot, generateSlots } from "@shared/rates";

const adminProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

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
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  venues: router({
    list: publicProcedure.query(() => db.listVenues()),
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

    /** Create a booking (walk-in or online). */
    create: publicProcedure.input(bookingInput).mutation(async ({ input }) => {
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
        input.courtId,
        input.playerDate,
        input.startHour,
        input.endHour,
      );
      if (conflict.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This slot is already booked" });
      }

      const tiers = await db.listRateTiersByVenue(input.venueId);
      const pricing = priceSlot(input.startHour, input.endHour, tiers);

      const reference = await db.generateReference();
      await db.insertBooking({
        ...input,
        contact: input.contact ?? null,
        paymentMethod: input.paymentMethod ?? null,
        reference,
        dayAmount: String(pricing.dayAmount),
        nightAmount: String(pricing.nightAmount),
        totalAmount: String(pricing.total),
        paymentStatus: input.channel === "walkin" && input.paymentMethod ? "paid" : "pending",
      });

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
          const conflict = await db.findConflictingBooking(courtId, playerDate, startHour, endHour, id);
          if (conflict.length > 0) {
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
  }),
});

export type AppRouter = typeof appRouter;
