import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "./_core/sdk";
import { appRouter } from "./routers";

const createCaller = () => {
  const adminCtx = {
    user: {
      id: 1,
      openId: "cron_test",
      name: "Test Admin",
      email: null,
      loginMethod: null,
      role: "owner",
      venueId: null,
      type: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as unknown as AuthenticatedUser,
    req: {} as never,
    res: {} as never,
  };
  return appRouter.createCaller(adminCtx);
};

describe("RESEND_API_KEY validation", () => {
  it(
    "verifies the Resend API key via a real test email to the registered domain",
    async () => {
      const key = process.env.RESEND_API_KEY;
      expect(key && key.startsWith("re_")).toBe(true);
      // The key is restricted to send-only, so validate it by sending a real
      // test email to the sender domain's own address (onboard@resend.dev).
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "onboarding@resend.dev",
          to: ["onboarding@resend.dev"],
          subject: "Davao Pickleball POS — API key check",
          text: "If you received this, your Resend API key is working.",
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id && body.id.length > 0).toBe(true);
    },
    { timeout: 30000 }
  );
});
