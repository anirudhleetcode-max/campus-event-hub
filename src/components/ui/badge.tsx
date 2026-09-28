import * as React from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted-foreground ring-border",
  primary: "bg-primary-soft text-primary-soft-foreground ring-primary/20",
  success: "bg-success-soft text-success-soft-foreground ring-success/25",
  warning: "bg-warning-soft text-warning-soft-foreground ring-warning/30",
  danger: "bg-danger-soft text-danger-soft-foreground ring-danger/25",
  info: "bg-info-soft text-info-soft-foreground ring-info/25",
};

export function Badge({ tone = "neutral", className, dot, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", tones[tone], className)}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {props.children}
    </span>
  );
}
