import type { Metadata } from "next";
import { Download, MessageSquareText, Star } from "lucide-react";
import { eventFeedbackSummary } from "@/server/services/feedback";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Progress, StatCard } from "@/components/ui/misc";
import { BarList } from "@/components/charts/bar-list";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { formatDate, formatNumber } from "@/lib/utils";
import { guarded, loadStaffEvent } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Feedback" };

const DIMENSIONS = [
  { key: "overall", label: "Overall" },
  { key: "organization", label: "Organization" },
  { key: "venue", label: "Venue" },
  { key: "speakers", label: "Speakers" },
  { key: "experience", label: "Experience" },
] as const;

function Stars({ value }: { value: number }) {
  return (
    <span role="img" className="inline-flex items-center gap-0.5 text-warning" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < value ? "size-3.5 fill-current" : "size-3.5 text-border-strong"} aria-hidden />
      ))}
    </span>
  );
}

export default async function EventFeedbackPage({ params }: PageProps<"/organizer/events/[id]/feedback">) {
  const { id } = await params;
  const { user, res: ev } = await loadStaffEvent(id);
  if (!ev.ok) return null;
  if (!ev.data.access.canView) return <ForbiddenState message="Volunteers can only use the check-in scanner for this event." backHref={`/organizer/events/${id}/scan`} backLabel="Open scanner" />;
  const res = await guarded(() => eventFeedbackSummary(user, id));
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const fb = res.data;
  const withText = fb.items.filter((i) => i.comments || i.suggestions);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Feedback</h2>
          <p className="text-sm text-muted-foreground">Ratings from participants after the event.</p>
        </div>
        <a href={`/api/exports/feedback?eventId=${id}`} className={buttonClasses("outline", "sm")} download>
          <Download /> Export CSV
        </a>
      </div>

      {fb.count === 0 ? (
        <Card>
          <EmptyState icon={MessageSquareText} title="No feedback yet" description="Participants are invited to rate the event once it ends. Responses will appear here." />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Responses" value={formatNumber(fb.count)} icon={MessageSquareText} />
            <StatCard label="Average rating" value={`${(fb.averages.overall ?? 0).toFixed(1)} / 5`} icon={Star} />
            <StatCard label="Comments" value={formatNumber(withText.length)} />
            <StatCard
              label="Would rate 4★ or more"
              value={`${Math.round((fb.distribution.filter((d) => d.rating >= 4).reduce((a, d) => a + d.count, 0) / fb.count) * 100)}%`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Average by area</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {DIMENSIONS.map((d) => {
                    const avg = fb.averages[d.key] ?? 0;
                    return (
                      <li key={d.key}>
                        <div className="mb-1 flex items-baseline justify-between text-sm">
                          <span>{d.label}</span>
                          <span className="font-medium tabular-nums">{avg.toFixed(1)}</span>
                        </div>
                        <Progress value={avg / 5} tone={avg >= 4 ? "success" : avg >= 3 ? "primary" : "warning"} label={`${d.label} ${avg.toFixed(1)} out of 5`} />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Rating distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={[...fb.distribution].reverse().map((d) => ({ name: `${d.rating} star${d.rating === 1 ? "" : "s"}`, value: d.count }))} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent>
              {withText.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Participants rated the event but didn&apos;t leave written comments.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {withText.map((f) => (
                    <li key={f.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Stars value={f.overall} />
                          <span className="text-sm font-medium">{f.user.name}</span>
                        </div>
                        <time dateTime={f.createdAt.toISOString()} className="text-xs text-muted-foreground">
                          {formatDate(f.createdAt)}
                        </time>
                      </div>
                      {f.comments && <p className="text-sm whitespace-pre-line">{f.comments}</p>}
                      {f.suggestions && (
                        <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-sm whitespace-pre-line">
                          <span className="font-medium">Suggestion: </span>
                          {f.suggestions}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
