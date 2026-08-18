/**
 * Booking confirmation email delivery via Resend.
 *
 * The confirmation email includes the promo discount line when a promo code
 * was used. Sending is best-effort: failures are logged, never thrown, so a
 * dead email gateway can never block a booking.
 */

const RESEND_API = "https://api.resend.com/emails";

/** The verified sender address on our free Resend account. */
const FROM = "onboarding@resend.dev";

export interface ConfirmationPayload {
  /** Player-facing name shown in the greeting. */
  playerName: string;
  /** Where the confirmation is sent. */
  to: string;
  /** Booking reference number. */
  reference: string;
  venueName: string;
  courtLabel: string;
  playerDate: string; // YYYY-MM-DD
  startHour: string; // HH:MM
  endHour: string; // HH:MM
  totalAmount: number; // final (discounted) amount in PHP
  discountAmount?: number;
  promoCode?: string;
}

/** Send the confirmation email. Throws only on transport failure; the caller
 *  should fire-and-forget (see sendBookingConfirmation). */
export async function sendConfirmationEmail(payload: ConfirmationPayload): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return; // email delivery not configured — skip silently

  const discountLine =
    payload.discountAmount && payload.discountAmount > 0
      ? `<tr><td style="padding:6px 12px;background:#f1f5f9;border-radius:8px;text-align:right;color:#b91c1c;font-weight:600;">Promo discount (${payload.promoCode ?? "code"})</td><td style="padding:6px 12px;text-align:right;font-weight:600;color:#b91c1c;">- ₱${payload.discountAmount.toFixed(2)}</td></tr>`
      : "";

  const html = `
  <!DOCTYPE html><html><body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    <div style="background:#15803d;color:#ffffff;padding:18px 24px;">
      <div style="font-size:18px;font-weight:700;">Pickleball Davao</div>
      <div style="font-size:13px;opacity:.9;">Booking confirmation</div>
    </div>
    <div style="padding:24px;">
      <div style="font-size:16px;color:#0f172a;">Hi ${escapeHtml(payload.playerName)},</div>
      <div style="margin-top:8px;color:#475569;font-size:14px;">Your court is booked. Here are your details:</div>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr><td style="padding:6px 12px;color:#64748b;">Reference</td><td style="padding:6px 12px;text-align:right;font-weight:600;color:#0f172a;">${escapeHtml(payload.reference)}</td></tr>
        <tr><td style="padding:6px 12px;color:#64748b;">Venue</td><td style="padding:6px 12px;text-align:right;color:#0f172a;">${escapeHtml(payload.venueName)}</td></tr>
        <tr><td style="padding:6px 12px;color:#64748b;">Court</td><td style="padding:6px 12px;text-align:right;color:#0f172a;">${escapeHtml(payload.courtLabel)}</td></tr>
        <tr><td style="padding:6px 12px;color:#64748b;">Date</td><td style="padding:6px 12px;text-align:right;color:#0f172a;">${escapeHtml(payload.playerDate)}</td></tr>
        <tr><td style="padding:6px 12px;color:#64748b;">Time</td><td style="padding:6px 12px;text-align:right;color:#0f172a;">${escapeHtml(payload.startHour)} – ${escapeHtml(payload.endHour)}</td></tr>
        ${discountLine}
        <tr><td style="padding:8px 12px;border-top:1px solid #e2e8f0;color:#64748b;font-weight:600;">Total</td><td style="padding:8px 12px;border-top:1px solid #e2e8f0;text-align:right;font-weight:700;color:#15803d;font-size:16px;">₱${payload.totalAmount.toFixed(2)}</td></tr>
      </table>
      <div style="margin-top:20px;color:#94a3b8;font-size:12px;text-align:center;">Thank you for booking with us — see you on the court!</div>
    </div>
  </div>
  </body></html>`;

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [payload.to],
      subject: `Booking confirmed #${payload.reference} — Pickleball Davao`,
      html,
      text: `Hi ${payload.playerName}, your court is booked. Reference ${payload.reference}. Venue ${payload.venueName}, Court ${payload.courtLabel}, ${payload.playerDate}, ${payload.startHour}–${payload.endHour}. Total ₱${payload.totalAmount.toFixed(2)}${payload.discountAmount ? ` (incl. promo discount of ₱${payload.discountAmount.toFixed(2)})` : ""}.`,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[resend] send failed (${res.status}): ${text.slice(0, 300)}`);
    return;
  }
  console.log(`[resend] confirmation email sent to ${payload.to} (ref ${payload.reference})`);
}

/** Best-effort wrapper: sends the confirmation email in the background and
 *  never throws, so booking creation is never blocked by email failures. */
export function sendBookingConfirmation(payload: ConfirmationPayload): void {
  if (!payload.to || !payload.to.includes("@")) return;
  void sendConfirmationEmail(payload).catch(err => {
    console.error("[resend] unexpected send error:", err);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}
