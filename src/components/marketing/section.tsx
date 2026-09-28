import * as React from "react";
import { cn } from "@/lib/utils";

/** Numbered eyebrow + heading used by every marketing section. */
export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  align = "left",
  className,
  id,
}: {
  index?: string;
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <p className={cn("flex items-center gap-2 font-mono text-xs font-medium tracking-wider text-primary uppercase", align === "center" && "justify-center")}>
        {index && <span className="text-muted-foreground">{index}</span>}
        {index && <span className="h-px w-6 bg-border-strong" aria-hidden />}
        {eyebrow}
      </p>
      <h2 id={id} className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {description && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

export function MarketingSection({
  id,
  labelledBy,
  className,
  children,
  tone = "default",
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
  tone?: "default" | "muted";
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("scroll-mt-20 py-16 sm:py-24", tone === "muted" && "border-y border-border bg-surface", className)}>
      <div className="container-page">{children}</div>
    </section>
  );
}
