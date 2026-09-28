import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { pdfSafe } from "./certificate";

export type ReportSection = { title: string; rows: [string, string][] };

/** Simple, printable A4 summary report (event reports, exports). */
export async function renderReportPdf(title: string, subtitle: string, sections: ReportSection[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(title));
  doc.setProducer("Campus Event Hub");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.23, 0.31, 0.85);
  let page = doc.addPage([595, 842]);
  let y = 780;

  const header = () => {
    page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: accent });
    page.drawText("Campus Event Hub", { x: 40, y: 822, size: 11, font: bold, color: rgb(1, 1, 1) });
  };
  header();
  page.drawText(pdfSafe(title).slice(0, 70), { x: 40, y, size: 20, font: bold, color: rgb(0.08, 0.1, 0.16) });
  y -= 22;
  page.drawText(pdfSafe(subtitle).slice(0, 100), { x: 40, y, size: 10, font, color: rgb(0.4, 0.43, 0.5) });
  y -= 30;

  for (const section of sections) {
    if (y < 120) {
      page = doc.addPage([595, 842]);
      header();
      y = 780;
    }
    page.drawText(pdfSafe(section.title), { x: 40, y, size: 13, font: bold, color: accent });
    y -= 8;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    y -= 18;
    for (const [k, v] of section.rows) {
      if (y < 60) {
        page = doc.addPage([595, 842]);
        header();
        y = 780;
      }
      page.drawText(pdfSafe(k).slice(0, 60), { x: 40, y, size: 10, font, color: rgb(0.3, 0.33, 0.4) });
      const val = pdfSafe(v).slice(0, 60);
      page.drawText(val, { x: 555 - bold.widthOfTextAtSize(val, 10), y, size: 10, font: bold, color: rgb(0.08, 0.1, 0.16) });
      y -= 18;
    }
    y -= 14;
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length} · Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, { x: 40, y: 30, size: 8, font, color: rgb(0.55, 0.58, 0.64) }));
  return doc.save();
}
