"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Percent, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, StatCard } from "@/components/ui/misc";
import { useRealtime } from "@/hooks/use-realtime";
import { removeAttendanceAction } from "@/app/actions/organizer";
import { formatNumber, formatPercent, formatTime } from "@/lib/utils";

export type CheckInEntry = { name: string; code: string; at: string; method?: string; by?: string };

/**
 * Live attendance counters + recent check-ins for one event. Counters update
 * instantly from `event:<id>:attendance` messages; the server-rendered table
 * refreshes shortly after (debounced).
 */
export function LiveAttendance({ eventId, initial }: { eventId: string; initial: { registered: number; checkedIn: number; recent: CheckInEntry[] } }) {
  const router = useRouter();
  const [counts, setCounts] = React.useState({ registered: initial.registered, checkedIn: initial.checkedIn });
  const [recent, setRecent] = React.useState(initial.recent);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt fresh server data after a refresh (render-phase sync, no effect needed).
  const [prevInitial, setPrevInitial] = React.useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCounts({ registered: initial.registered, checkedIn: initial.checkedIn });
    setRecent(initial.recent);
  }

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const { connected } = useRealtime([`event:${eventId}:attendance`], (_topic, data) => {
    if (typeof data.registered === "number" && typeof data.checkedIn === "number") {
      setCounts({ registered: data.registered, checkedIn: data.checkedIn });
    }
    const last = data.last as { name?: unknown; code?: unknown; at?: unknown } | undefined;
    if (last && typeof last.name === "string" && typeof last.code === "string" && typeof last.at === "string") {
      const entry: CheckInEntry = { name: last.name, code: last.code, at: last.at, method: "QR" };
      setRecent((r) => [entry, ...r.filter((x) => x.code !== entry.code)].slice(0, 10));
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 2000);
  });

  const rate = counts.registered ? counts.checkedIn / counts.registered : 0;
  const notIn = Math.max(0, counts.registered - counts.checkedIn);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <span className={connected ? "size-2 animate-pulse-dot rounded-full bg-success" : "size-2 rounded-full bg-border-strong"} aria-hidden />
          {connected ? "Live" : "Connecting…"}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
        <StatCard label="Total registered" value={formatNumber(counts.registered)} icon={Users} />
        <StatCard label="Checked in" value={formatNumber(counts.checkedIn)} icon={UserCheck} />
        <StatCard label="Attendance" value={formatPercent(rate)} icon={Percent} hint={<Progress value={rate} tone="success" className="w-24" label="Attendance rate" />} />
        <StatCard label="Not checked in" value={formatNumber(notIn)} icon={UserX} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent check-ins</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No one has checked in yet. Check-ins appear here the moment a pass is scanned.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((c) => (
                <li key={`${c.code}-${c.at}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{c.code}</span>
                      {c.method === "MANUAL" ? " · manual" : ""}
                      {c.by ? ` · by ${c.by}` : ""}
                    </p>
                  </div>
                  <time dateTime={c.at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatTime(c.at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Undo an incorrect check-in (managers only; audited with a reason). */
export function UndoCheckInButton({ eventId, registrationId, name }: { eventId: string; registrationId: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="sm">
          Undo
        </Button>
      }
      title={`Undo ${name}'s check-in?`}
      description="The attendance record will be removed. Use this only for mistaken check-ins."
      confirmLabel="Undo check-in"
      reasonLabel="Reason"
      onConfirm={async (reason) => {
        try {
          const res = await removeAttendanceAction(eventId, registrationId, reason);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(res.message ?? "Check-in removed.");
          router.refresh();
        } catch {
          toast.error("Something went wrong. Please try again.");
          return false;
        }
      }}
    />
  );
}
