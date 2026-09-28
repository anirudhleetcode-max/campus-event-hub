import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { recordCheckoutDismissed } from "@/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ orderId: z.string().trim().min(1).max(200) });

/** Records that the user closed Checkout without paying (the seat hold simply expires). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const { orderId } = bodySchema.parse(await readJson(req));
    await recordCheckoutDismissed(user, orderId);
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err, { route: "POST /api/payments/dismiss" });
  }
}
