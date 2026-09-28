import Link from "next/link";
import { cn } from "@/lib/utils";

/** Query-string driven filter pills (e.g. ?status=upcoming). Server-rendered, no client JS. */
export function FilterPills({ items, active, label }: { items: { value: string; label: string; href: string; count?: number }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto pb-1">
      <ul className="flex min-w-max gap-2 px-1">
        {items.map((it) => {
          const current = it.value === active;
          return (
            <li key={it.value}>
              <Link
                href={it.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {it.label}
                {typeof it.count === "number" && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      current ? "bg-primary-foreground/20 text-primary-foreground" : "bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {it.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
