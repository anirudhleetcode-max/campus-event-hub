import QRCode from "qrcode";
import { cn } from "@/lib/utils";

/** Server-rendered QR code as inline SVG (no client JS). */
export async function QRCodeSvg({ value, className, label }: { value: string; className?: string; label: string }) {
  const svg = await QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("overflow-hidden rounded-lg bg-white p-2 [&_svg]:h-full [&_svg]:w-full", className)}
      // The SVG is generated locally by the qrcode library from an opaque token.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
