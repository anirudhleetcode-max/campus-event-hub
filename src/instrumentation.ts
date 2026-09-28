/**
 * Runs once when a Next.js server starts. Logs a value-free configuration
 * summary so a misconfigured deployment is obvious in the very first log
 * lines instead of on the first failed payment, email or upload.
 * (`npm run check:config` prints the same report in detail.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { inspectConfig, summarizeConfig } = await import("./server/config");
  const report = inspectConfig(process.env);
  const problems = [report.core, report.razorpay, report.email, report.storage, report.cron].flatMap((r) => r.errors);
  const line = (level: string, msg: string, extra: Record<string, unknown>) =>
    console[level === "error" ? "error" : "log"](JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
  if (problems.length > 0) {
    line("error", "Configuration problems detected. Run `npm run check:config` for details.", { ...summarizeConfig(report), problems });
  } else {
    line("info", "Configuration checked", summarizeConfig(report));
  }
}
