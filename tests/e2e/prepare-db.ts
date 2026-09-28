import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";

/**
 * Creates, migrates and seeds the dedicated E2E database.
 *
 * This runs as the first half of the Playwright `webServer` command
 * (`prepare-db && next start`). Playwright launches webServer BEFORE
 * globalSetup, so the database must be prepared here, or Next.js would start
 * against a database that doesn't exist yet.
 *
 * The seed wipes every table, so this refuses to touch anything that doesn't
 * look like a dedicated E2E database.
 */
function assertSafeTarget(url: URL) {
  const dbName = url.pathname.slice(1);
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Invalid E2E database name "${dbName}".`);
  if (!/e2e/i.test(dbName)) {
    throw new Error(`Refusing to reset "${dbName}": the E2E database name must contain "e2e" (e.g. campus_hub_e2e).`);
  }
  const devEnvFile = ".env";
  if (existsSync(devEnvFile)) {
    const devUrl = parse(readFileSync(devEnvFile)).DATABASE_URL;
    if (devUrl) {
      const dev = new URL(devUrl);
      if (dev.host === url.host && dev.pathname === url.pathname) {
        throw new Error(`Refusing to reset "${dbName}": it is the development database configured in .env.`);
      }
    }
  }
  return dbName;
}

async function prepare() {
  const raw = process.env.E2E_DATABASE_URL;
  if (!raw) throw new Error("E2E_DATABASE_URL is not set (playwright.config.ts provides a default).");
  const url = new URL(raw);
  const dbName = assertSafeTarget(url);

  // 1. Ensure the database exists (connect to the maintenance DB to create it).
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  // 2. Apply migrations, 3. load deterministic seed data — always against the E2E URL.
  const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_DATABASE_URL: url.toString(), APP_ENV: "test" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
  console.log(`E2E database "${dbName}" migrated and seeded.`);
}

prepare().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
