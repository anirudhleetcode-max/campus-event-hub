import { requireUser } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { AppError, forbidden } from "@/server/errors";
import { assertSameOrigin, errorResponse, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { storeImage, type UploadKind } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;
const KINDS = ["banner", "gallery", "logo", "avatar", "signature"] as const satisfies readonly UploadKind[];

function isKind(v: unknown): v is UploadKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

/**
 * Image upload (multipart/form-data: `file`, `kind`).
 * The file's real type and dimensions are validated server-side by storeImage().
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    await rateLimit(`upload:${user.id}`, 30, 60 * 60);

    // Reject oversized bodies before buffering them (multipart overhead allowance included).
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BYTES + 64 * 1024) {
      throw new AppError("VALIDATION", "The image must be smaller than 6 MB.");
    }
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new AppError("VALIDATION", "Please upload the image as a file.");
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new AppError("VALIDATION", "The upload could not be read. Please try again.");
    }
    const kind = form.get("kind");
    const file = form.get("file");
    if (!isKind(kind)) throw new AppError("VALIDATION", "Unknown upload type.");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose an image to upload.", { fieldErrors: { file: "Choose an image" } });
    if (file.size === 0) throw new AppError("VALIDATION", "The file is empty.");
    if (file.size > MAX_BYTES) throw new AppError("VALIDATION", "The image must be smaller than 6 MB.");

    const allowed =
      kind === "avatar" ? true
        : kind === "banner" || kind === "gallery" ? can(user, "events:create")
          : can(user, "college:profile");
    if (!allowed) throw forbidden("You don't have permission to upload this type of image.");

    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeImage(buf, kind, user.id);
    return json(stored, { status: 201 });
  } catch (err) {
    return errorResponse(err, { route: "uploads" });
  }
}
