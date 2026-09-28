import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { verifyCheckout } from "@/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const field = z.string().trim().min(1).max(200);
const bodySchema = z.object({ razorpay_order_id: field, razorpay_payment_id: field, razorpay_signature: field });

/**
 * Verifies a Checkout success callback (signature + gateway fetch). The
 * browser callback alone never confirms a registration.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const input = bodySchema.parse(await readJson(req));
    const result = await verifyCheckout(user, input);
    return json(result);
  } catch (err) {
    return errorResponse(err, { route: "POST /api/payments/verify" });
  }
}
