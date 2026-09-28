import Link from "next/link";

type Item = { name: string; value: number; href?: string; hint?: string };

/**
 * Ranked horizontal bars (single series). Plain HTML, so it is keyboard and
 * screen-reader friendly by construction; the value sits at each bar's tip
 * and the full value/hint is exposed on hover via title.
 */
export function BarList({ items, format = (v: number) => v.toLocaleString("en-IN"), emptyText = "No data for this period." }: { items: Item[]; format?: (v: number) => string; emptyText?: string }) {
  if (items.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((it) => {
        const label = it.href ? (
          <Link href={it.href} className="truncate hover:text-primary hover:underline">
            {it.name}
          </Link>
        ) : (
          <span className="truncate">{it.name}</span>
        );
        return (
          <li key={it.name} className="group" title={`${it.name}: ${format(it.value)}${it.hint ? ` · ${it.hint}` : ""}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 text-foreground">{label}</span>
              <span className="shrink-0 font-medium text-foreground tabular-nums">
                {format(it.value)}
                {it.hint && <span className="ml-1 font-normal text-muted-foreground">{it.hint}</span>}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-2" aria-hidden>
              <div className="h-2 rounded-r-full rounded-l-sm bg-chart-1 transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
