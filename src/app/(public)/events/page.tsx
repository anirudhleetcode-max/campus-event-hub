import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSearch } from "lucide-react";
import { getFilterOptions, listPublicEvents, type EventListFilters } from "@/server/services/events";
import { EventCard } from "@/components/events/event-card";
import { EmptyState } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput, UrlDateInput, UrlSelect } from "@/components/ui/url-controls";
import { buttonClasses } from "@/components/ui/button";
import { FilterPanel } from "@/components/marketing/filter-panel";
import { EVENT_MODE } from "@/lib/labels";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore Events",
  description: "Discover hackathons, workshops, fests, seminars and sports events from colleges across India. Filter by category, college, date and price.",
  alternates: { canonical: "/events" },
};

type SearchParams = Record<string, string | string[] | undefined>;

const SORTS = ["soonest", "newest", "popular", "price_asc", "price_desc"] as const;
const WHENS = ["upcoming", "past", "all"] as const;
const FILTER_KEYS = ["q", "category", "college", "department", "mode", "price", "from", "to", "when", "sort"] as const;

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

function pick<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === v);
}

function isoDate(v: string | undefined): string | undefined {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

function isUuid(v: string | undefined): string | undefined {
  return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined;
}

function parseFilters(sp: SearchParams): EventListFilters {
  const page = Number.parseInt(one(sp.page) ?? "1", 10);
  return {
    q: one(sp.q)?.slice(0, 100),
    category: one(sp.category),
    college: one(sp.college),
    department: isUuid(one(sp.department)),
    mode: pick(one(sp.mode), ["IN_PERSON", "ONLINE", "HYBRID"] as const),
    price: pick(one(sp.price), ["free", "paid"] as const),
    from: isoDate(one(sp.from)),
    to: isoDate(one(sp.to)),
    when: pick(one(sp.when), WHENS),
    sort: pick(one(sp.sort), SORTS),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: 12,
  };
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const [result, options] = await Promise.all([listPublicEvents(filters), getFilterOptions()]);

  const collegeById = new Map(options.colleges.map((c) => [c.id, c]));
  const selectedCollege = options.colleges.find((c) => c.slug === filters.college);
  const departmentOptions = options.departments
    .filter((d) => !selectedCollege || d.collegeId === selectedCollege.id)
    .map((d) => {
      const college = collegeById.get(d.collegeId);
      return { value: d.id, label: `${d.name} · ${college?.shortName ?? college?.name ?? ""}`.replace(/ · $/, "") };
    });

  const activeCount = FILTER_KEYS.filter((k) => k !== "q" && one(sp[k])).length;
  const hasFilters = activeCount > 0 || Boolean(filters.q);
  const when = filters.when ?? "upcoming";

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="max-w-2xl">
        <p className="font-mono text-xs font-medium tracking-wider text-primary uppercase">Event discovery</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Explore events</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Hackathons, workshops, fests, seminars and sports meets from colleges on Campus Event Hub.
        </p>
      </header>

      <section aria-label="Search and filters" className="mt-8 space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <SearchInput placeholder="Search events, colleges, departments or tags" label="Search events" />
        <FilterPanel activeCount={activeCount}>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <FilterField label="Category">
              <UrlSelect param="category" label="Category" allLabel="All categories" className="w-full" options={options.categories.map((c) => ({ value: c.slug, label: c.name }))} />
            </FilterField>
            <FilterField label="College">
              <UrlSelect param="college" label="College" allLabel="All colleges" className="w-full" options={options.colleges.map((c) => ({ value: c.slug, label: c.name }))} />
            </FilterField>
            <FilterField label="Department">
              <UrlSelect param="department" label="Department" allLabel="All departments" className="w-full" options={departmentOptions} />
            </FilterField>
            <FilterField label="Mode">
              <UrlSelect param="mode" label="Mode" allLabel="Any mode" className="w-full" options={Object.entries(EVENT_MODE).map(([value, label]) => ({ value, label }))} />
            </FilterField>
            <FilterField label="Price">
              <UrlSelect param="price" label="Price" allLabel="Any price" className="w-full" options={[{ value: "free", label: "Free" }, { value: "paid", label: "Paid" }]} />
            </FilterField>
            <FilterField label="When">
              <UrlSelect
                param="when"
                label="When"
                allLabel={null}
                className="w-full"
                options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All dates" }]}
              />
            </FilterField>
            <FilterField label="From">
              <UrlDateInput param="from" label="Starts on or after" className="w-full" />
            </FilterField>
            <FilterField label="To">
              <UrlDateInput param="to" label="Starts on or before" className="w-full" />
            </FilterField>
          </div>
        </FilterPanel>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-semibold text-foreground">{formatNumber(result.total)}</span> {result.total === 1 ? "event" : "events"} found
          {hasFilters && (
            <>
              {" · "}
              <Link href="/events" className="font-medium text-primary hover:underline">
                Clear filters
              </Link>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground" aria-hidden>
            Sort
          </span>
          <UrlSelect
            param="sort"
            label="Sort events"
            allLabel={null}
            className="min-w-44"
            options={[
              { value: "soonest", label: when === "past" ? "Most recent" : "Soonest first" },
              { value: "newest", label: "Newly published" },
              { value: "popular", label: "Most popular" },
              { value: "price_asc", label: "Price: low to high" },
              { value: "price_desc", label: "Price: high to low" },
            ]}
          />
        </div>
      </div>

      {result.items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface">
          <EmptyState
            icon={CalendarSearch}
            title={hasFilters ? "No events match your filters" : "No upcoming events yet"}
            description={
              hasFilters
                ? "Try removing a filter, widening the date range or searching for something else."
                : "New events are published regularly. Check back soon or browse past events."
            }
            action={
              hasFilters ? (
                <Link href="/events" className={buttonClasses("outline", "md")}>
                  Clear filters
                </Link>
              ) : (
                <Link href="/events?when=past" className={buttonClasses("outline", "md")}>
                  Browse past events
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((e) => (
              <li key={e.id} className="grid">
                <EventCard event={e} />
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <Pagination page={result.page} pageCount={result.pageCount} total={result.total} pageSize={result.pageSize} basePath="/events" searchParams={sp} />
          </div>
        </>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground" aria-hidden>
        {label}
      </span>
      {children}
    </div>
  );
}
