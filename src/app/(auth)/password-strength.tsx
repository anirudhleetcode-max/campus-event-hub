import { Progress } from "@/components/ui/misc";

const LEVELS = [
  { label: "Too weak", tone: "danger" },
  { label: "Weak", tone: "danger" },
  { label: "Fair", tone: "warning" },
  { label: "Good", tone: "primary" },
  { label: "Strong", tone: "success" },
] as const;

/** Heuristic strength score 0–4 (length, letters+digits, mixed case, symbols). */
function score(pw: string): number {
  if (pw.length < 8) return pw.length ? 0 : -1;
  let s = 1;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return Math.min(s, 4);
}

export function PasswordStrength({ password }: { password: string }) {
  const s = score(password);
  if (s < 0) return null;
  const level = LEVELS[s];
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <Progress value={(s + 1) / LEVELS.length} tone={level.tone} className="h-1.5" label="Password strength" />
      <span className="shrink-0 text-xs text-muted-foreground">{level.label}</span>
    </div>
  );
}
