import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { imageSize } from "image-size";
import { configReport, env, isProduction } from "./env";
import { AppError } from "./errors";
import { randomToken } from "./crypto";
import { logger } from "./logger";
import { can } from "./auth/permissions";
import type { SessionUser } from "./auth/session";

export type UploadKind = "banner" | "gallery" | "logo" | "avatar" | "signature";

/** Who may upload which kind of image: anyone their own avatar; event creators banners/gallery; college admins logos/signatures. */
export function canUpload(user: SessionUser, kind: UploadKind): boolean {
  if (kind === "avatar") return true;
  if (kind === "banner" || kind === "gallery") return can(user, "events:create");
  return can(user, "college:profile");
}

const RULES: Record<UploadKind, { maxBytes: number; minW: number; minH: number; maxW: number; maxH: number }> = {
  banner: { maxBytes: 5 * 1024 * 1024, minW: 800, minH: 300, maxW: 6000, maxH: 4000 },
  gallery: { maxBytes: 5 * 1024 * 1024, minW: 400, minH: 300, maxW: 6000, maxH: 6000 },
  logo: { maxBytes: 2 * 1024 * 1024, minW: 64, minH: 64, maxW: 4000, maxH: 4000 },
  avatar: { maxBytes: 2 * 1024 * 1024, minW: 64, minH: 64, maxW: 4000, maxH: 4000 },
  signature: { maxBytes: 1024 * 1024, minW: 100, minH: 30, maxW: 3000, maxH: 2000 },
};

type Sniffed = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

/** Detects the real file type from magic bytes — the client-declared MIME type is not trusted. SVG is rejected (XSS risk). */
export function sniffImage(buf: Buffer): Sniffed | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export function validateImage(buf: Buffer, kind: UploadKind): Sniffed & { width: number; height: number } {
  const rule = RULES[kind];
  if (buf.length === 0) throw new AppError("VALIDATION", "The file is empty.");
  if (buf.length > rule.maxBytes) throw new AppError("VALIDATION", `The image must be smaller than ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`);
  const type = sniffImage(buf);
  if (!type) throw new AppError("VALIDATION", "Only PNG, JPEG or WebP images are allowed.");
  let dims: { width?: number; height?: number };
  try {
    dims = imageSize(buf);
  } catch {
    throw new AppError("VALIDATION", "The image appears to be corrupted.");
  }
  const w = dims.width ?? 0;
  const h = dims.height ?? 0;
  if (w < rule.minW || h < rule.minH) throw new AppError("VALIDATION", `The image must be at least ${rule.minW}×${rule.minH} pixels.`);
  if (w > rule.maxW || h > rule.maxH) throw new AppError("VALIDATION", `The image must be at most ${rule.maxW}×${rule.maxH} pixels.`);
  return { ...type, width: w, height: h };
}

interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<string>;
}

class S3Provider implements StorageProvider {
  private client: S3Client;
  constructor(private bucket: string, private publicBase: string, endpoint: string | undefined, region: string, key: string, secret: string) {
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId: key, secretAccessKey: secret },
    });
  }
  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
    );
    return `${this.publicBase.replace(/\/$/, "")}/${key}`;
  }
}

/**
 * Non-production fallback: files live in .data/uploads and are served by the
 * /uploads/[...key] route handler. (Files written into public/ after a build
 * are not served by `next start`, so public/ can't be used.)
 */
export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

class LocalProvider implements StorageProvider {
  async put(key: string, body: Buffer) {
    const target = path.join(LOCAL_UPLOAD_DIR, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return `/uploads/${key}`;
  }
}

const CONTENT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

/** Reads a locally stored upload, refusing anything outside the upload directory. */
export async function readLocalUpload(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!/^[a-z]+\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(key)) return null;
  const file = path.resolve(LOCAL_UPLOAD_DIR, key);
  if (!file.startsWith(LOCAL_UPLOAD_DIR + path.sep)) return null;
  try {
    return { body: await readFile(file), contentType: CONTENT_TYPES[key.split(".").pop()!]! };
  } catch {
    return null;
  }
}

let s3: { signature: string; provider: S3Provider } | null = null;

/**
 * S3-compatible storage when fully configured; the local .data/uploads
 * fallback only outside production. A partial or invalid storage
 * configuration is an error rather than a silent fallback.
 */
function provider(): StorageProvider {
  const report = configReport().storage;
  if (report.status === "MISCONFIGURED") {
    logger.error("File storage is misconfigured (run npm run check:config)", { problems: report.errors });
    throw new AppError("INTERNAL", "File uploads are not configured correctly. Please contact the administrator.");
  }
  if (report.status === "CONFIGURED") {
    const e = env();
    const signature = [e.STORAGE_URL, e.STORAGE_BUCKET, e.STORAGE_REGION, e.STORAGE_KEY, e.STORAGE_PUBLIC_URL].join("|");
    if (s3?.signature !== signature) {
      s3 = { signature, provider: new S3Provider(e.STORAGE_BUCKET!, e.STORAGE_PUBLIC_URL!, e.STORAGE_URL, e.STORAGE_REGION || "auto", e.STORAGE_KEY!, e.STORAGE_SECRET!) };
    }
    return s3.provider;
  }
  if (isProduction()) throw new AppError("INTERNAL", "File uploads are not configured. Please contact the administrator.");
  return new LocalProvider();
}

export async function storeImage(buf: Buffer, kind: UploadKind, ownerId: string): Promise<{ url: string; width: number; height: number }> {
  const info = validateImage(buf, kind);
  const key = `${kind}/${ownerId}/${Date.now()}-${randomToken(8)}.${info.ext}`;
  const url = await provider().put(key, buf, info.mime);
  return { url, width: info.width, height: info.height };
}
