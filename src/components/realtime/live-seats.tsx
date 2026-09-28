"use client";

import { useState } from "react";
import { useRealtime } from "@/hooks/use-realtime";
import { Progress } from "@/components/ui/misc";
import { formatNumber } from "@/lib/utils";

/** Remaining-seat counter that updates live as people register (topic event:<id>:stats). */
export function LiveSeats({ eventId, capacity, initialTaken, compact }: { eventId: string; capacity: number; initialTaken: number; compact?: boolean }) {
  const [remaining, setRemaining] = useState(Math.max(0, capacity - initialTaken));
  useRealtime([`event:${eventId}:stats`], (_t, data) => {
    if (typeof data.remaining === "number") setRemaining(data.remaining);
  });
  const taken = capacity - remaining;
  const ratio = capacity ? taken / capacity : 0;
  const tone = remaining === 0 ? "danger" : ratio > 0.85 ? "warning" : "primary";
  if (compact) {
    return (
      <span className="tabular-nums" aria-live="polite">
        {remaining === 0 ? "Full" : `${formatNumber(remaining)} of ${formatNumber(capacity)} seats left`}
      </span>
    );
  }
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{remaining === 0 ? "No seats left" : `${formatNumber(remaining)} seats left`}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatNumber(taken)} / {formatNumber(capacity)} taken
        </span>
      </div>
      <Progress value={ratio} tone={tone} label="Seats taken" />
    </div>
  );
}
