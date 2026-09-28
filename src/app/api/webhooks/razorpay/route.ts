import { errorResponse, json } from "@/server/http";
import { AppError } from "@/server/errors";
import { handleRazorpayWebhook } from "@/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Razorpay webhook receiver. Authenticated by the HMAC signature over the RAW
 * body (so it must be read with req.text() before any parsing) and
 * de-duplicated by x-razorpay-event-id inside the service. No session or
 * same-origin check: Razorpay calls this server-to-server. Any non-2xx
 * response makes Razorpay retry the delivery.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) throw new AppError("VALIDATION", "Payload too large.");
    const result = await handleRazorpayWebhook(rawBody, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
    return json({ ok: true, duplicate: result.duplicate });
  } catch (err) {
    return errorResponse(err, { route: "POST /api/webhooks/razorpay" });
  }
}
