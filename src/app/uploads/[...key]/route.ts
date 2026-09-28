import { readLocalUpload } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves uploads stored by the local (non-production) storage fallback. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const file = await readLocalUpload(key.join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
