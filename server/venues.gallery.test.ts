import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { listGalleryByVenue, insertGalleryRow, removeGalleryRow } from "./db";

// Mock the S3 storage helper so tests never hit real storage.
const mockStoragePut = vi.hoisted(() =>
  vi.fn(async (key: string, _buffer: Buffer, _mime: string) => ({
    key,
    url: `https://storage.example.com/${key}`,
  })),
);
vi.mock("./storage", async () => {
  const real = await vi.importActual<typeof import("./storage")>("./storage");
  return { ...real, storagePut: mockStoragePut };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
type SessionUser = AuthenticatedUser & { venueId?: number | null };

function baseCtx(user: SessionUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
      cookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

function globalAdminCtx(venueId: number | null = null): TrpcContext {
  return baseCtx({
    id: 1,
    type: "owner",
    identity: "owner",
    name: "owner",
    email: null,
    role: "owner",
    venueId,
  });
}

function guestCtx(): TrpcContext {
  return baseCtx(null);
}

const venueId = 3; // Matina Town Square — exists in the seeded live DB.
const cascadeVenueId = 8; // 929 Pickleyard — reserved for the delete-cascade test.
const tinyPngBase64 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
).toString("base64");

afterEach(async () => {
  mockStoragePut.mockClear();
  // Clean up any gallery rows created during the test so rows don't bleed between tests.
  const rows = await listGalleryByVenue(venueId);
  for (const row of rows) await removeGalleryRow(row.id);
});

describe("venue gallery (master admin + public list)", () => {
  it("gallery.list is public — guests can read it", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const rows = await caller.venues.gallery({ venueId });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("requires the global owner session to upload — denies guests", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.venues.uploadGalleryImage({
        venueId,
        fileName: "court.png",
        mimeType: "image/png",
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow(/Master admin/);
  });

  it("requires the global owner session to upload — denies venue-bound owners", async () => {
    const caller = appRouter.createCaller(globalAdminCtx(5));
    await expect(
      caller.venues.uploadGalleryImage({
        venueId: 5,
        fileName: "court.png",
        mimeType: "image/png",
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow(/Master admin/);
  });

  it("rejects non-image MIME types on gallery uploads", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    await expect(
      caller.venues.uploadGalleryImage({
        venueId,
        fileName: "hack.exe",
        mimeType: "application/x-executable" as never,
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow();
  });

  it("rejects images over 8 MB and never touches storage", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    const huge = Buffer.alloc(9 * 1024 * 1024, 0).toString("base64");
    await expect(
      caller.venues.uploadGalleryImage({
        venueId,
        fileName: "big.png",
        mimeType: "image/png",
        base64: huge,
      }),
    ).rejects.toThrow(/8 MB/);
    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("rejects gallery uploads for venues that don't exist", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    await expect(
      caller.venues.uploadGalleryImage({
        venueId: 999999,
        fileName: "court.png",
        mimeType: "image/png",
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("uploads valid images in order, lists them via the public query, and allows removal", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());

    const a = await caller.venues.uploadGalleryImage({
      venueId,
      fileName: "first.png",
      mimeType: "image/png",
      base64: tinyPngBase64,
    });
    const b = await caller.venues.uploadGalleryImage({
      venueId,
      fileName: "second.png",
      mimeType: "image/png",
      base64: tinyPngBase64,
    });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(a.imageKey).toMatch(/^venue-gallery\/3-\d+-first\.png$/);
    expect(mockStoragePut).toHaveBeenCalledTimes(2);

    const rows = await caller.venues.gallery({ venueId });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.imageKey).toBe(a.imageKey);
    expect(rows[1]!.imageKey).toBe(b.imageKey);

    // Guests see the same gallery.
    const publicRows = await appRouter.createCaller(guestCtx()).venues.gallery({ venueId });
    expect(publicRows).toHaveLength(2);

    // Removing the first row keeps the second.
    await caller.venues.removeGalleryImage({ id: a.id });
    const after = await caller.venues.gallery({ venueId });
    expect(after).toHaveLength(1);
    expect(after[0]!.imageKey).toBe(b.imageKey);
  });

  it("deleteVenue cascades gallery rows to keep the database clean", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    // Create a disposable venue to delete — avoids mutating the seeded 929 Pickleyard (id drifts on recreate).
    const created = await caller.venues.create({
      name: "Temp Gallery Test Venue",
      address: "1 Test Lane, Poblacion, Davao City",
      surfaceType: "outdoor",
      openTime: "06:00",
      closeTime: "22:00",
      courtCount: 1,
      dayRate: "100",
      nightRate: "150",
    });
    const targetVenueId = (created as { venueId: number }).venueId;
    const v = await caller.venues.uploadGalleryImage({
      venueId: targetVenueId,
      fileName: "x.png",
      mimeType: "image/png",
      base64: tinyPngBase64,
    });
    const rows = await listGalleryByVenue(targetVenueId);
    expect(rows.some(r => r.imageKey === v.imageKey)).toBe(true);
    await caller.venues.delete({ venueId: targetVenueId });
    const after = await listGalleryByVenue(targetVenueId);
    expect(after).toHaveLength(0);
  }, 20000);
});
