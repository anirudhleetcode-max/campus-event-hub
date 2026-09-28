"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);
const serverSnapshot = () => null;

/** Live "seat held for mm:ss" indicator for a pending-payment registration. */
export function HoldCountdown({ expiresAt, className }: { expiresAt: string | Date; className?: string }) {
  const now = useSyncExternalStore(subscribe, nowSeconds, serverSnapshot);
  const expiry = new Date(expiresAt);
  const remaining = now === null ? null : Math.max(0, Math.floor(expiry.getTime() / 1000) - now);
  const expired = remaining === 0;
  const mm = remaining === null ? "--" : String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = remaining === null ? "--" : String(remaining % 60).padStart(2, "0");

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm",
        expired ? "border-danger/30 bg-danger-soft text-danger-soft-foreground" : "border-warning/40 bg-warning-soft text-warning-soft-foreground",
        className,
      )}
    >
      <Clock className="size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {expired ? (
          <p>
            <span className="font-semibold">Your seat hold has expired.</span> You can still try to pay — we&apos;ll reserve a new seat if one is available.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Seat reserved for you</span> until {formatTime(expiry)}. Complete payment to confirm it.
          </p>
        )}
      </div>
      {!expired && (
        <span className="shrink-0 font-mono text-base font-semibold tabular-nums" role="timer" aria-label={`Time remaining: ${mm} minutes ${ss} seconds`}>
          {mm}:{ss}
        </span>
      )}
    </div>
  );
}
