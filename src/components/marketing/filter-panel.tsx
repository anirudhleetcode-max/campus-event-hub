"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** Filters are always visible from `md` up; on small screens they collapse behind a toggle. */
export function FilterPanel({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium shadow-sm hover:bg-surface-2 md:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {open ? "Hide filters" : "Show filters"}
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{activeCount}</span>
        )}
      </button>
      <div id={id} className={cn("mt-3 md:mt-0 md:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  );
}
