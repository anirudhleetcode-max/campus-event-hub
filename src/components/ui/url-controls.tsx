"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Select } from "./input";

function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const update = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );
  return { update, params, pending };
}

/** Debounced search box that syncs to the `q` (or custom) URL parameter for server-side filtering. */
export function SearchInput({ placeholder = "Search…", param = "q", className, label = "Search" }: { placeholder?: string; param?: string; className?: string; label?: string }) {
  const { update, params, pending } = useUpdateParams();
  const [value, setValue] = React.useState(params.get(param) ?? "");
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => update(param, value.trim() || null), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <Search className={cn("pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground", pending && "animate-pulse")} aria-hidden />
      <Input type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={label} className="pl-9 pr-9" maxLength={100} />
      {value && (
        <button type="button" onClick={() => setValue("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Clear search">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** A <select> bound to a URL search parameter. */
export function UrlSelect({ param, options, label, className, allLabel = "All" }: { param: string; options: { value: string; label: string }[]; label: string; className?: string; allLabel?: string | null }) {
  const { update, params } = useUpdateParams();
  return (
    <Select aria-label={label} value={params.get(param) ?? ""} onChange={(e) => update(param, e.target.value || null)} className={cn("w-auto min-w-36", className)}>
      {allLabel !== null && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function UrlDateInput({ param, label, className }: { param: string; label: string; className?: string }) {
  const { update, params } = useUpdateParams();
  return <Input type="date" aria-label={label} value={params.get(param) ?? ""} onChange={(e) => update(param, e.target.value || null)} className={cn("w-auto", className)} />;
}
