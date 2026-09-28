import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

/**
 * Writes a Y4M video (the format Chromium's fake webcam reads) that shows a QR
 * code for `payload`, so the real scanner (getUserMedia + jsQR) can be tested.
 */
export function writeQrVideo(payload: string, file: string) {
  const W = 640;
  const H = 480;
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const quiet = 4;
  const scale = Math.floor(400 / (n + quiet * 2));
  const side = (n + quiet * 2) * scale;
  const ox = Math.floor((W - side) / 2);
  const oy = Math.floor((H - side) / 2);

  const y = Buffer.alloc(W * H, 235); // light background
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = oy + (r + quiet) * scale + dy;
        y.fill(16, row * W + ox + (c + quiet) * scale, row * W + ox + (c + quiet + 1) * scale);
      }
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma]);
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame, frame]));
}
