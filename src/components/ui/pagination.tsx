import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { page: number; pageCount: number; total: number; pageSize: number; basePath: string; searchParams: Record<string, string | string[] | undefined> };

function href(basePath: string, sp: Props["searchParams"], page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v === undefined) continue;
    (Array.isArray(v) ? v : [v]).forEach((x) => params.append(k, x));
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Server-rendered, link-based pagination that preserves active filters. */
export function Pagination({ page, pageCount, total, pageSize, basePath, searchParams }: Props) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Array.from(new Set([1, page - 1, page, page + 1, pageCount])).filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors";
  return (
    <nav className="flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Pagination">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–<span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </p>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={href(basePath, searchParams, page - 1)} className={cn(btn, "hover:bg-surface-2")} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className={cn(btn, "opacity-40")} aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
        </li>
        {pages.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && pages[i - 1]! < p - 1 && <span className="px-1 text-muted-foreground">…</span>}
            <Link
              href={href(basePath, searchParams, p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(btn, p === page ? "bg-primary text-primary-foreground" : "hover:bg-surface-2")}
            >
              {p}
            </Link>
          </li>
        ))}
        <li>
          {page < pageCount ? (
            <Link href={href(basePath, searchParams, page + 1)} className={cn(btn, "hover:bg-surface-2")} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className={cn(btn, "opacity-40")} aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
