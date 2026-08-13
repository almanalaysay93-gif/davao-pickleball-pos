import { describe, expect, it, vi, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

const venueId = 1;
const tinyPngBase64 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
).toString("base64");

afterEach(() => {
  mockStoragePut.mockClear();
});

describe("venue image upload (master admin)", () => {
  it("requires the global owner session — denies guests", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.venues.uploadVenueImage({
        venueId,
        fileName: "court.png",
        mimeType: "image/png",
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow(/Master admin/);
  });

  it("requires the global owner session — denies venue-bound owners", async () => {
    const caller = appRouter.createCaller(globalAdminCtx(5));
    await expect(
      caller.venues.uploadVenueImage({
        venueId: 5,
        fileName: "court.png",
        mimeType: "image/png",
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow(/Master admin/);
  });

  it("rejects non-image MIME types", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    await expect(
      caller.venues.uploadVenueImage({
        venueId,
        fileName: "hack.exe",
        mimeType: "application/x-executable" as never,
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow();
  });

  it("rejects images over 8 MB", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    const huge = Buffer.alloc(9 * 1024 * 1024, 0).toString("base64");
    await expect(
      caller.venues.uploadVenueImage({
        venueId,
        fileName: "big.png",
        mimeType: "image/png",
        base64: huge,
      }),
    ).rejects.toThrow(/8 MB/);
    // Large payload must never reach storage.
    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("rejects uploads for venues that don't exist", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    await expect(
      caller.venues.uploadVenueImage({
        venueId: 999999,
        fileName: "court.png",
        mimeType: "image/png",
        base64: tinyPngBase64,
      }),
    ).rejects.toThrow(/not found/i);
    expect(mockStoragePut).not.toHaveBeenCalled();
  });

  it("uploads a valid image, sets imageKey on the venue, and lets update clear it", async () => {
    const caller = appRouter.createCaller(globalAdminCtx());
    const res = await caller.venues.uploadVenueImage({
      venueId,
      fileName: "court.png",
      mimeType: "image/png",
      base64: tinyPngBase64,
    });
    expect(res.success).toBe(true);
    expect(res.imageKey).toMatch(/^venue-images\/1-\d+-court\.png$/);
    expect(mockStoragePut).toHaveBeenCalledTimes(1);

    const list = await caller.venues.list();
    const v1 = list.find(v => v.id === venueId);
    expect(v1?.imageKey).toBe(res.imageKey);

    // Owners photo can be cleared by passing imageKey: null.
    await caller.venues.update({ venueId, imageKey: null });
    const after = await caller.venues.list();
    expect(after.find(v => v.id === venueId)?.imageKey).toBeNull();
  });
});
