import { execSync } from "node:child_process";
import { Client } from "pg";

/** Creates (if needed) and migrates the dedicated test database. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgresql://campus:campus@localhost:5432/campus_hub_test?schema=public");
  const dbName = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_DATABASE_URL: url.toString() }, stdio: "pipe" });
}
