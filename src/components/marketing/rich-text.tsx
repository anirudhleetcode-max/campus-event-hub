import { cn } from "@/lib/utils";

/** Renders user-authored plain text as paragraphs, preserving line breaks. Never interprets HTML. */
export function PlainText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-foreground/90 sm:text-[15px]", className)}>
      {paragraphs.map((p, i) => (
        <p key={i} className="break-words whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
