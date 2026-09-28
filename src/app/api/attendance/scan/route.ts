import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { checkIn } from "@/server/services/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  eventId: z.uuid(),
  payload: z.string().trim().min(1, "Empty QR code").max(200, "QR code is too long"),
});

/** Records a check-in from a scanned QR pass. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await rateLimit(`scan:${user.id}`, 120, 60);
    const { eventId, payload } = bodySchema.parse(await readJson(req, 4096));
    const result = await checkIn(user, eventId, payload, "QR");
    return json({
      status: result.status,
      registration: {
        id: result.registration.id,
        code: result.registration.code,
        participantName: result.registration.participantName,
        checkInAt: result.registration.checkInAt.toISOString(),
      },
    });
  } catch (err) {
    return errorResponse(err, { route: "attendance.scan" });
  }
}
