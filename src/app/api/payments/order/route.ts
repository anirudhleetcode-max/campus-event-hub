import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { createPaymentOrder } from "@/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ registrationId: z.uuid("Invalid registration") });

/** Creates (or reuses) a Razorpay order for the caller's pending registration. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await rateLimit(`pay-order:${user.id}`, 10, 10 * 60);
    const { registrationId } = bodySchema.parse(await readJson(req));
    const order = await createPaymentOrder(user, registrationId);
    return json(order);
  } catch (err) {
    return errorResponse(err, { route: "POST /api/payments/order" });
  }
}
