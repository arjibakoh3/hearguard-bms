#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import nextEnv from "@next/env";
import { provisionUser } from "../server/identity.mjs";
import { closeDatabase } from "../server/connection.mjs";

nextEnv.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
}
const email = option("--email")?.trim().toLowerCase();
const role = option("--role");
const organizationCode = option("--organization-code");
const alsoPhysicianFor = option("--also-physician-for");
const rotate = args.includes("--rotate");
const generate = args.includes("--generate");
const outputPath = option("--output");
const allowedRoles = new Set(["HOSPITAL_ADMIN", "OCCUPATIONAL_PHYSICIAN", "OCCUPATIONAL_HEALTH_STAFF", "COMPANY_USER"]);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !allowedRoles.has(role)
  || (role === "HOSPITAL_ADMIN" ? Boolean(organizationCode) : !organizationCode)
  || (alsoPhysicianFor && role !== "HOSPITAL_ADMIN")
  || (generate && !outputPath)) {
  console.error("Usage: pnpm account:provision -- --email <address> --role <role> [--organization-code CODE] [--also-physician-for BEERTHIP_1991] [--rotate] [--generate --output <private file>]");
  process.exit(2);
}

async function hiddenPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("Interactive terminal required for hidden password input");
  process.stdout.write("New password (at least 16 characters): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          process.stdin.off("data", onData);
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          process.stdin.off("data", onData);
          resolve(value);
          return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const password = generate ? randomBytes(36).toString("base64url") : await hiddenPassword();
  if (password.length < 16) throw new Error("Password must contain at least 16 characters");
  if (generate) {
    mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
    if ((statSync(dirname(outputPath)).mode & 0o077) !== 0) {
      throw new Error("Password file directory must be private (mode 0700)");
    }
    if (existsSync(outputPath)) throw new Error("Password output file already exists");
  }
  await provisionUser({ email, password, role, organizationCode, alsoPhysicianFor, rotate, fullName: option("--name") ?? "" });
  if (generate) writeFileSync(outputPath, `${password}\n`, { flag: "wx", mode: 0o600 });
  console.log(`${rotate ? "Rotated" : "Created"} ${email} as ${role}${organizationCode ? ` for ${organizationCode}` : ""}${alsoPhysicianFor ? ` and OCCUPATIONAL_PHYSICIAN for ${alsoPhysicianFor}` : ""}.`);
  if (generate) console.log(`One-time password saved with mode 0600 to ${outputPath}.`);
}

main().finally(closeDatabase).catch((error) => {
  console.error(error instanceof Error ? error.message : "Provisioning failed");
  process.exitCode = 1;
});
