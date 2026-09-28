/**
 * npm run check:config [-- --skip-db]
 *
 * Validates the environment for the current APP_ENV and prints a report.
 * Secret values are never printed: only variable names and what is wrong.
 * Exits 1 when anything would stop this deployment from working correctly,
 * so it can gate a deploy (see vercel.json).
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { inspectConfig, type IntegrationReport } from "../src/server/config";

// Real environment variables win over .env (process.loadEnvFile doesn't override them).
if (existsSync(".env")) process.loadEnvFile(".env");

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const good = (s: string) => paint(32, s);
const bad = (s: string) => paint(31, s);
const dim = (s: string) => paint(90, s);

function row(label: string, status: string, ok: boolean | null) {
  const dots = ".".repeat(Math.max(3, 20 - label.length));
  console.log(`${label} ${dim(dots)} ${ok === null ? status : ok ? good(status) : bad(status)}`);
}

function notes(r: { errors: string[]; warnings: string[] }) {
  for (const e of r.errors) console.log(`    ${bad("✗")} ${e}`);
  for (const w of r.warnings) console.log(`    ${dim("!")} ${dim(w)}`);
}

async function checkDatabase(): Promise<{ ok: boolean; message: string }> {
  if (!process.env.DATABASE_URL) return { ok: false, message: "DATABASE_URL is not set" };
  const db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    const applied = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`.catch(() => []);
    const dir = path.join("prisma", "migrations");
    const expected = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    const done = new Set(applied.map((m) => m.migration_name));
    const pending = expected.filter((m) => !done.has(m));
    if (pending.length) return { ok: false, message: `connected, but ${pending.length} migration(s) not applied — run npm run db:deploy` };
    return { ok: true, message: `connected, ${expected.length} migration(s) applied` };
  } catch {
    // The error text can include the connection string, so it is not printed.
    return { ok: false, message: "cannot connect (check DATABASE_URL and that PostgreSQL is running)" };
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const skipDb = process.argv.includes("--skip-db");
  const report = inspectConfig(process.env);

  console.log(`\nCampus Event Hub configuration — APP_ENV=${report.appEnv}\n`);
  row("CORE CONFIG", report.core.ok ? "PASS" : "FAIL", report.core.ok);
  notes(report.core);

  let dbOk = true;
  if (skipDb) row("DATABASE", "SKIPPED", null);
  else {
    const d = await checkDatabase();
    dbOk = d.ok;
    row("DATABASE", d.ok ? "PASS" : "FAIL", d.ok);
    console.log(`    ${d.ok ? dim(d.message) : `${bad("✗")} ${d.message}`}`);
  }

  const integrations: [string, IntegrationReport][] = [
    ["RAZORPAY", report.razorpay],
    ["EMAIL", report.email],
    ["STORAGE", report.storage],
    ["CRON", report.cron],
  ];
  for (const [label, r] of integrations) {
    const extra = Object.entries(r.details).map(([k, v]) => `${k}=${v}`).join(", ");
    const status = r.status.replace("_", " ") + (extra ? ` (${extra})` : "");
    row(label, status, r.errors.length ? false : r.status === "CONFIGURED" ? true : null);
    notes(r);
  }

  const ok = report.ok && dbOk;
  console.log(`\n${ok ? good("Configuration OK") : bad("Configuration has problems that must be fixed")} for APP_ENV=${report.appEnv}.\n`);
  process.exit(ok ? 0 : 1);
}

void main();
