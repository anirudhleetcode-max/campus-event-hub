import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * When the page is printed, only the content inside <PrintArea> is shown —
 * the app chrome (sidebar, top bar, buttons) is hidden. Elements inside the
 * area marked with `print:hidden` are hidden as well.
 */
export function PrintArea({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <>
      <style>{`@media print {
  @page { margin: 12mm; }
  body * { visibility: hidden !important; }
  [data-print-area], [data-print-area] * { visibility: visible !important; }
  [data-print-area] { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none !important; }
  html, body { background: #fff !important; }
}`}</style>
      <div data-print-area className={cn(className)}>
        {children}
      </div>
    </>
  );
}
