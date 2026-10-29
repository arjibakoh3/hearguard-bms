import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { getPool, checkDatabaseRole, closeDatabase } from "../server/connection.mjs";

export async function migrateDatabase() {
  await checkDatabaseRole();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(642918276)");
    await client.query("create schema if not exists hearguard_meta");
    await client.query("revoke all on schema hearguard_meta from public");
    await client.query("create table if not exists hearguard_meta.migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now())");
    const directory = new URL("../database/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = (await readFile(new URL(name, directory), "utf8")).replace(/\r\n/g, "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prior = await client.query("select checksum from hearguard_meta.migrations where name=$1", [name]);
      if (prior.rows.length) {
        if (prior.rows[0].checksum !== checksum) throw new Error(`Applied migration checksum changed: ${name}`);
        continue;
      }
      if (name === "0001_bms.sql") {
        const existing = await client.query("select tablename from pg_tables where schemaname in ('public','auth','hearguard_auth')");
        if (existing.rows.length) throw new Error("Initial migration requires an empty, dedicated BMS database; existing tables will not be replaced");
      }
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: "service_role" })]);
      await client.query(sql);
      await client.query("insert into hearguard_meta.migrations(name,checksum) values($1,$2)", [name, checksum]);
      console.log(`Applied database migration ${name}`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd());
  migrateDatabase().then(closeDatabase).catch(async (error) => {
    console.error(error.message);
    await closeDatabase();
    process.exitCode = 1;
  });
}
