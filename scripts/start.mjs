import { spawn } from "node:child_process";
import { migrateDatabase } from "./migrate.mjs";
import { bootstrapAdministrator } from "../server/identity.mjs";
import { closeDatabase } from "../server/connection.mjs";

try {
  await migrateDatabase();
  await bootstrapAdministrator();
  await closeDatabase();
  const server = spawn(process.execPath, ["server.js"], { stdio: "inherit", env: process.env });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal));
  server.on("exit", (code) => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(`HearGuard startup stopped: ${error.message}`);
  await closeDatabase();
  process.exitCode = 1;
}
