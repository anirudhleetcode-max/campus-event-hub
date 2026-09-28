import * as React from "react";
import { formatDate } from "@/lib/utils";

export function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  sections: { heading: string; body: React.ReactNode }[];
}) {
  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs font-medium tracking-wider text-primary uppercase">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {formatDate(updated, { day: "numeric", month: "long", year: "numeric" })}</p>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">{intro}</p>
        <nav aria-label="On this page" className="mt-8 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold">On this page</p>
          <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#s-${i + 1}`} className="text-muted-foreground hover:text-foreground">
                  <span className="font-mono text-xs">{String(i + 1).padStart(2, "0")}</span> {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.heading} id={`s-${i + 1}`} aria-labelledby={`s-${i + 1}-h`} className="scroll-mt-24">
              <h2 id={`s-${i + 1}-h`} className="text-lg font-semibold">
                <span className="mr-2 font-mono text-sm text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                {s.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px] [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5 [&_strong]:text-foreground">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
