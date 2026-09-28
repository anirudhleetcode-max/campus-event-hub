import type { CertificateType } from "@prisma/client";
import { Award } from "lucide-react";
import { CERTIFICATE_HEADING, CERTIFICATE_TYPE } from "@/lib/labels";
import { cn, formatDate } from "@/lib/utils";

type Props = {
  collegeName: string;
  type: CertificateType;
  recipientName: string;
  eventTitle: string;
  date: Date | string;
  code: string;
  position?: string | null;
  /** Category colour used for the accent frame. */
  accentColor?: string | null;
  revoked?: boolean;
  className?: string;
};

/**
 * Miniature, HTML rendering of a certificate for cards and previews. The
 * downloadable PDF is rendered on the server; this mirrors its structure.
 */
export function CertificatePreview({ collegeName, type, recipientName, eventTitle, date, code, position, accentColor, revoked, className }: Props) {
  const accent = accentColor ?? "var(--primary)";
  return (
    <figure
      className={cn("@container relative aspect-[1.414/1] w-full overflow-hidden rounded-lg border border-border bg-surface text-center shadow-sm", className)}
      aria-label={`${CERTIFICATE_TYPE[type]} certificate for ${recipientName}, ${eventTitle}`}
    >
      {/* Frame */}
      <div className="absolute inset-1.5 rounded-md border-2" style={{ borderColor: `color-mix(in oklab, ${accent} 70%, transparent)` }} aria-hidden />
      <div className="absolute inset-3 rounded-sm border" style={{ borderColor: `color-mix(in oklab, ${accent} 25%, transparent)` }} aria-hidden />
      <div className="absolute top-0 left-1/2 h-1.5 w-1/3 -translate-x-1/2 rounded-b-md" style={{ background: accent }} aria-hidden />

      <div className="relative flex h-full flex-col items-center justify-center gap-[0.35em] px-[10%] py-[7%] text-[length:clamp(7px,2.6cqw,13px)]">
        <p className="line-clamp-1 text-[0.95em] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{collegeName}</p>
        <p className="font-serif text-[1.9em] leading-tight font-semibold" style={{ color: `color-mix(in oklab, ${accent} 72%, black)` }}>
          {CERTIFICATE_HEADING[type]}
        </p>
        <p className="text-[0.85em] text-muted-foreground">This is to certify that</p>
        <p className="line-clamp-1 max-w-full border-b border-border px-4 pb-[0.2em] font-serif text-[1.7em] leading-tight font-semibold italic">
          {recipientName}
        </p>
        <p className="line-clamp-2 max-w-[90%] text-[0.9em] leading-snug text-muted-foreground">
          {position ? `secured ${position} in ` : type === "VOLUNTEER" ? "served as a volunteer for " : type === "SPEAKER" ? "spoke at " : type === "ORGANIZER" ? "organised " : "participated in "}
          <span className="font-semibold text-foreground">{eventTitle}</span>
        </p>
        <div className="mt-[0.6em] flex w-full items-end justify-between text-[0.75em] text-muted-foreground">
          <span className="text-left">
            <span className="block font-medium text-foreground">{formatDate(date, { day: "numeric", month: "short", year: "numeric" })}</span>
            Date
          </span>
          <Award className="size-[2.6em]" style={{ color: accent }} strokeWidth={1.4} aria-hidden />
          <span className="text-right">
            <span className="block font-mono font-medium text-foreground">{code}</span>
            Certificate ID
          </span>
        </div>
      </div>

      {revoked && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
          <span className="-rotate-12 rounded-md border-2 border-danger px-3 py-1 text-sm font-bold tracking-widest text-danger uppercase">Revoked</span>
        </div>
      )}
    </figure>
  );
}
