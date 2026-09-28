"use client";

import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table as TableIcon, LineChart } from "lucide-react";

type Point = { date: string; value: number };

const fmtDate = (d: string, bucket: "day" | "month") =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", bucket === "month" ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });

/**
 * Single-series trend (area wash + 2px line) with a crosshair tooltip and an
 * accessible table view. Single series → no legend; the card title names it.
 */
export function TrendChart({
  data,
  bucket = "day",
  valueLabel,
  format = (v: number) => v.toLocaleString("en-IN"),
  height = 240,
}: {
  data: Point[];
  bucket?: "day" | "month";
  valueLabel: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const [view, setView] = useState<"chart" | "table">("chart");
  const total = data.reduce((a, p) => a + p.value, 0);
  const peak = data.reduce((m, p) => (p.value > m.value ? p : m), data[0] ?? { date: "", value: 0 });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Total <span className="font-semibold text-foreground tabular-nums">{format(total)}</span>
          {peak.value > 0 && (
            <>
              {" · "}Peak <span className="font-semibold text-foreground tabular-nums">{format(peak.value)}</span> on {fmtDate(peak.date, bucket)}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-foreground"
          aria-pressed={view === "table"}
        >
          {view === "chart" ? <TableIcon className="size-3.5" aria-hidden /> : <LineChart className="size-3.5" aria-hidden />}
          {view === "chart" ? "Table" : "Chart"}
        </button>
      </div>
      {view === "table" ? (
        <div className="max-h-[240px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{valueLabel} over time</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{valueLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1.5">{fmtDate(p.date, bucket)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${valueLabel} trend: total ${format(total)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => fmtDate(d, bucket)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "var(--chart-grid)" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
                      <p className="text-muted-foreground">{fmtDate(String(payload[0].payload.date), bucket)}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-foreground tabular-nums">
                        <span className="size-2 rounded-full bg-chart-1" aria-hidden />
                        {format(Number(payload[0].value))} <span className="font-normal text-muted-foreground">{valueLabel.toLowerCase()}</span>
                      </p>
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill={`url(#${gid})`}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--chart-1)" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
