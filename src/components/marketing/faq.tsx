import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Accessible accordion built on native <details>/<summary> — keyboard operable without JavaScript. */
export function FaqList({ items, className }: { items: { question: string; answer: string }[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-border rounded-xl border border-border bg-surface", className)}>
      {items.map((item) => (
        <details key={item.question} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-sm font-medium sm:text-base">
            <span>{item.question}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="pb-5 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
