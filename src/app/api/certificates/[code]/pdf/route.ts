import { requireUser } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { certificatePdf } from "@/server/services/certificates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Downloads a certificate PDF. Owner, event staff and admins only (enforced by the service). */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireUser();
    const { code } = await ctx.params;
    const { filename, bytes } = await certificatePdf(user, code.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64));
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    const asciiName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
    return new Response(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err, { route: "GET /api/certificates/[code]/pdf" });
  }
}
