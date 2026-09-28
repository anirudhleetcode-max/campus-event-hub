"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/use-realtime";

/**
 * Re-renders the current server component tree when a realtime message arrives
 * on any of the given topics (debounced). Used for dashboards whose numbers
 * are computed on the server.
 */
export function LiveRefresh({ topics, debounceMs = 1500 }: { topics: string[]; debounceMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { connected } = useRealtime(topics, () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), debounceMs);
  });
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span className={connected ? "size-2 rounded-full bg-success animate-pulse-dot" : "size-2 rounded-full bg-border-strong"} aria-hidden />
      {connected ? "Live" : "Connecting…"}
    </span>
  );
}
