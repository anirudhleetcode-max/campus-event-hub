import { execSync } from "node:child_process";
import { Client } from "pg";

/**
 * Creates, migrates and seeds the dedicated E2E database. Runs as part of the
 * Playwright webServer command (webServer starts before globalSetup).
 */
async function prepare() {
  const url = new URL(process.env.E2E_DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_DATABASE_URL: url.toString(), APP_ENV: "test" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}

prepare().catch((err) => {
  console.error(err);
  process.exit(1);
});
