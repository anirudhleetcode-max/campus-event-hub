import { Award, CalendarDays, CheckCircle2, Clock, IndianRupee, MapPin, ScanLine, ShieldCheck, Ticket, Users } from "lucide-react";
import { QRCodeSvg } from "@/components/ui/qr-code";
import { cn } from "@/lib/utils";

/*
 * Product illustrations composed from UI primitives (no stock imagery).
 * They are decorative previews of the interface: each is exposed to
 * assistive technology as a single labelled image.
 */

function Frame({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className={cn("rounded-xl border border-border bg-surface shadow-lg", className)}>
      {children}
    </div>
  );
}

/** Mini bar chart made of plain divs. Values are relative heights (0–1). */
export function MiniBars({ values, className, highlight }: { values: number[]; className?: string; highlight?: number }) {
  return (
    <div className={cn("flex h-24 items-end gap-1.5", className)} aria-hidden>
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-1 items-end rounded-sm bg-surface-2">
          <div
            className={cn("w-full rounded-sm", i === highlight ? "bg-accent" : "bg-primary/80")}
            style={{ height: `${Math.round(Math.max(0.06, Math.min(1, v)) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function DashboardMock({ className }: { className?: string }) {
  const rows = [
    { name: "Registrations", w: "82%" },
    { name: "Checked in", w: "64%" },
    { name: "Feedback", w: "41%" },
  ];
  return (
    <Frame label="Illustration of the organizer dashboard" className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="size-2 rounded-full bg-border-strong" />
        <span className="size-2 rounded-full bg-border-strong" />
        <span className="size-2 rounded-full bg-border-strong" />
        <span className="ml-3 font-mono text-[10px] text-muted-foreground">organizer / dashboard</span>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Users, label: "Registered" },
            { icon: IndianRupee, label: "Collected" },
            { icon: ScanLine, label: "Checked in" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-lg border border-border p-2.5">
              <Icon className="size-3.5 text-primary" />
              <p className="mt-2 text-[10px] text-muted-foreground">{label}</p>
              <div className="mt-1 h-2.5 w-3/4 rounded bg-surface-3" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-medium">Registrations per day</span>
            <span className="font-mono text-[10px] text-muted-foreground">14d</span>
          </div>
          <MiniBars values={[0.2, 0.28, 0.24, 0.4, 0.36, 0.5, 0.46, 0.62, 0.58, 0.7, 0.66, 0.84, 0.78, 0.95]} highlight={13} className="h-16" />
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[10px] text-muted-foreground">{r.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-primary" style={{ width: r.w }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** Ticket-style QR pass with a perforated tear line. */
export async function QrPassMock({ className }: { className?: string }) {
  return (
    <Frame label="Illustration of a QR event pass" className={cn("relative w-full max-w-[17rem] overflow-hidden", className)}>
      <div className="bg-primary px-4 py-3 text-primary-foreground">
        <p className="font-mono text-[10px] tracking-wider uppercase opacity-95">Event pass</p>
        <p className="mt-0.5 text-sm font-semibold">Your registration is confirmed</p>
      </div>
      <div className="space-y-1.5 px-4 py-3 text-[11px] text-muted-foreground">
        <p className="flex items-center gap-2">
          <CalendarDays className="size-3.5" /> Date and time on your pass
        </p>
        <p className="flex items-center gap-2">
          <MapPin className="size-3.5" /> Venue and gate details
        </p>
      </div>
      <div className="relative border-t border-dashed border-border-strong">
        <span className="absolute -top-2 -left-2 size-4 rounded-full border border-border bg-background" />
        <span className="absolute -top-2 -right-2 size-4 rounded-full border border-border bg-background" />
      </div>
      <div className="flex items-center gap-3 p-4">
        <QRCodeSvg value="CAMPUS-EVENT-HUB-SAMPLE-PASS" label="Sample QR code" className="size-20 shrink-0 border border-border p-1" />
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground uppercase">Registration ID</p>
          <p className="truncate font-mono text-xs font-semibold">REG-XXXXXXXX</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success-soft-foreground">
            <CheckCircle2 className="size-3" /> Scan at entry
          </p>
        </div>
      </div>
    </Frame>
  );
}

export function CertificateMock({ className }: { className?: string }) {
  return (
    <Frame label="Illustration of a verifiable certificate" className={cn("w-full max-w-xs p-2", className)}>
      <div className="rounded-lg border-2 border-double border-border-strong px-5 py-5 text-center">
        <Award className="mx-auto size-6 text-accent" />
        <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Certificate of participation</p>
        <div className="mx-auto mt-3 h-3 w-2/3 rounded bg-surface-3" />
        <div className="mx-auto mt-2 h-2 w-4/5 rounded bg-surface-2" />
        <div className="mx-auto mt-1.5 h-2 w-3/5 rounded bg-surface-2" />
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3 text-left">
          <div>
            <p className="font-mono text-[9px] text-muted-foreground uppercase">Verify</p>
            <p className="font-mono text-[10px] font-semibold">CERT-XXXX-XXXX</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary-soft-foreground">
            <ShieldCheck className="size-3" /> Authentic
          </span>
        </div>
      </div>
    </Frame>
  );
}

export function ApprovalQueueMock({ className }: { className?: string }) {
  const items = [
    { tone: "bg-warning", label: "Pending approval", w: "w-3/5" },
    { tone: "bg-success", label: "Registration open", w: "w-4/5" },
    { tone: "bg-info", label: "Published", w: "w-2/3" },
    { tone: "bg-danger", label: "Cancelled · refunds queued", w: "w-1/2" },
  ];
  return (
    <Frame label="Illustration of the college admin approval queue" className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold">College events</span>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">audit log on</span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-3 px-4 py-3">
            <span className={cn("size-2 shrink-0 rounded-full", it.tone)} />
            <div className="min-w-0 flex-1">
              <div className={cn("h-2.5 rounded bg-surface-3", it.w)} />
              <p className="mt-1.5 text-[10px] text-muted-foreground">{it.label}</p>
            </div>
            <Clock className="size-3.5 shrink-0 text-muted-foreground" />
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function RegistrationToastMock({ className }: { className?: string }) {
  return (
    <div role="img" aria-label="Illustration of a payment confirmation" className={cn("flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-success-soft text-success-soft-foreground">
        <Ticket className="size-4" />
      </span>
      <div>
        <p className="text-xs font-semibold">Payment verified</p>
        <p className="text-[11px] text-muted-foreground">Seat confirmed · pass issued</p>
      </div>
    </div>
  );
}
