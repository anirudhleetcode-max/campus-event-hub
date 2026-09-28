import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { logger } from "../logger";

export type CertificateData = {
  code: string;
  typeLabel: string;
  heading: string;
  recipientName: string;
  body: string;
  eventTitle: string;
  collegeName: string;
  issuedOn: string;
  verifyUrl: string;
  accentColor: string;
  collegeLogoUrl?: string | null;
  eventLogoText: string;
  eventColor: string;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  signatureUrl?: string | null;
};

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x3b4fd8;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Standard PDF fonts only support WinAnsi; transliterate/strip anything else. */
export function pdfSafe(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

async function loadImage(doc: PDFDocument, url: string | null | undefined): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    let bytes: Uint8Array;
    if (url.startsWith("/")) {
      const file = path.join(process.cwd(), "public", path.normalize(url).replace(/^(\.\.[/\\])+/, ""));
      if (!file.startsWith(path.join(process.cwd(), "public"))) return null;
      bytes = await readFile(file);
    } else if (/^https:\/\//.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      bytes = new Uint8Array(await res.arrayBuffer());
    } else return null;
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
    return null;
  } catch (err) {
    logger.warn("Certificate image could not be loaded", { url, error: err });
    return null;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = rgb(0.1, 0.12, 0.18)) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (page.getWidth() - w) / 2, y, size, font, color });
}

function monogram(page: PDFPage, x: number, y: number, r: number, text: string, color: ReturnType<typeof rgb>, font: PDFFont) {
  page.drawCircle({ x, y, size: r, color });
  const t = pdfSafe(text).slice(0, 3).toUpperCase() || "E";
  const size = r * 0.72;
  page.drawText(t, { x: x - font.widthOfTextAtSize(t, size) / 2, y: y - size * 0.35, size, font, color: rgb(1, 1, 1) });
}

export async function renderCertificatePdf(d: CertificateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.typeLabel} certificate - ${pdfSafe(d.recipientName)}`);
  doc.setSubject(pdfSafe(d.eventTitle));
  doc.setProducer("Campus Event Hub");
  doc.setCreator("Campus Event Hub");

  const page = doc.addPage([842, 595]); // A4 landscape
  const W = page.getWidth();
  const H = page.getHeight();
  const accent = hexToRgb(d.accentColor);
  const ink = rgb(0.09, 0.11, 0.17);
  const muted = rgb(0.4, 0.43, 0.5);

  const [serif, serifBold, serifItalic, sans, sansBold] = await Promise.all([
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.TimesRomanBold),
    doc.embedFont(StandardFonts.TimesRomanItalic),
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
  ]);

  // Frame
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.995, 0.993, 0.985) });
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: accent, borderWidth: 3 });
  page.drawRectangle({ x: 28, y: 28, width: W - 56, height: H - 56, borderColor: accent, borderWidth: 0.6, opacity: 0 });
  page.drawRectangle({ x: 18, y: H - 26, width: W - 36, height: 8, color: accent });

  // Logos
  const logo = await loadImage(doc, d.collegeLogoUrl);
  if (logo) {
    const s = logo.scaleToFit(70, 70);
    page.drawImage(logo, { x: 60, y: H - 60 - s.height, width: s.width, height: s.height });
  } else {
    monogram(page, 95, H - 95, 32, d.collegeName.split(/\s+/).map((w) => w[0]).join(""), accent, sansBold);
  }
  monogram(page, W - 95, H - 95, 32, d.eventLogoText, hexToRgb(d.eventColor), sansBold);

  centered(page, pdfSafe(d.collegeName).toUpperCase(), H - 90, sansBold, 12, muted);
  centered(page, "CERTIFICATE", H - 150, serifBold, 40, ink);
  centered(page, pdfSafe(d.heading).toUpperCase(), H - 178, sans, 13, accent);

  centered(page, "This is to certify that", H - 225, serifItalic, 15, muted);
  const name = pdfSafe(d.recipientName);
  const nameSize = Math.min(38, (W - 200) / Math.max(1, serifBold.widthOfTextAtSize(name, 1)));
  centered(page, name, H - 272, serifBold, nameSize, ink);
  const nameW = serifBold.widthOfTextAtSize(name, nameSize);
  page.drawLine({ start: { x: (W - nameW) / 2 - 20, y: H - 282 }, end: { x: (W + nameW) / 2 + 20, y: H - 282 }, thickness: 0.8, color: accent });

  const lines = wrap(pdfSafe(d.body), serif, 15, W - 220);
  lines.slice(0, 4).forEach((l, i) => centered(page, l, H - 315 - i * 21, serif, 15, ink));

  // Signature block
  const sigY = 118;
  const sig = await loadImage(doc, d.signatureUrl);
  if (sig) {
    const s = sig.scaleToFit(150, 45);
    page.drawImage(sig, { x: 100 + (170 - s.width) / 2, y: sigY + 6, width: s.width, height: s.height });
  } else if (d.signatoryName) {
    const t = pdfSafe(d.signatoryName);
    page.drawText(t, { x: 100 + (170 - serifItalic.widthOfTextAtSize(t, 20)) / 2, y: sigY + 12, size: 20, font: serifItalic, color: rgb(0.13, 0.2, 0.45) });
  }
  page.drawLine({ start: { x: 100, y: sigY }, end: { x: 270, y: sigY }, thickness: 0.8, color: muted });
  const sName = pdfSafe(d.signatoryName ?? "Authorised Signatory");
  page.drawText(sName, { x: 100 + (170 - sansBold.widthOfTextAtSize(sName, 10)) / 2, y: sigY - 15, size: 10, font: sansBold, color: ink });
  const sTitle = pdfSafe(d.signatoryTitle ?? d.collegeName).slice(0, 48);
  page.drawText(sTitle, { x: 100 + (170 - sans.widthOfTextAtSize(sTitle, 9)) / 2, y: sigY - 28, size: 9, font: sans, color: muted });

  // Issue date
  centered(page, `Issued on ${pdfSafe(d.issuedOn)}`, sigY - 15, sans, 10, muted);

  // Verification QR
  const qrPng = await QRCode.toBuffer(d.verifyUrl, { type: "png", margin: 1, width: 240, errorCorrectionLevel: "M" });
  const qr = await doc.embedPng(qrPng);
  page.drawImage(qr, { x: W - 180, y: 70, width: 84, height: 84 });
  page.drawText("Scan to verify", { x: W - 180, y: 58, size: 8, font: sans, color: muted });
  page.drawText(`Certificate ID: ${d.code}`, { x: 60, y: 44, size: 9, font: sansBold, color: ink });
  const vText = pdfSafe(d.verifyUrl);
  page.drawText(vText, { x: W - 60 - sans.widthOfTextAtSize(vText, 8), y: 44, size: 8, font: sans, color: muted });

  return doc.save();
}
