#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase URL or server secret key is unavailable");
  const password = generate ? randomBytes(36).toString("base64url") : await hiddenPassword();
  if (password.length < 16) throw new Error("Password must contain at least 16 characters");
  if (generate) {
    mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
    if ((statSync(dirname(outputPath)).mode & 0o077) !== 0) {
      throw new Error("Password file directory must be private (mode 0700)");
    }
    if (existsSync(outputPath)) throw new Error("Password output file already exists");
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  let organizationId = null;
  if (organizationCode) {
    const organization = await client.from("organizations").select("id").eq("code", organizationCode).single();
    if (organization.error || !organization.data) throw new Error(`Organization ${organizationCode} was not found`);
    organizationId = organization.data.id;
  }
  let physicianOrganizationId = null;
  if (alsoPhysicianFor) {
    const organization = await client.from("organizations").select("id")
      .eq("code", alsoPhysicianFor).eq("active", true).single();
    if (organization.error || !organization.data) throw new Error(`Physician organization ${alsoPhysicianFor} was not found`);
    physicianOrganizationId = organization.data.id;
  }
  let user = null;
  for (let page = 1; page <= 20; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw result.error;
    user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
    if (user || result.data.users.length < 100) break;
  }
  if (user && !rotate) throw new Error("User already exists; pass --rotate to change its password and access");
  const createdNewUser = !user;
  if (user) {
    const result = await client.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (result.error) throw result.error;
  } else {
    const result = await client.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error || !result.data.user) throw result.error ?? new Error("User creation failed");
    user = result.data.user;
  }
  const accessRows = [{ user_id: user.id, organization_id: organizationId, role, active: true }];
  if (physicianOrganizationId) {
    accessRows.push({ user_id: user.id, organization_id: physicianOrganizationId,
      role: "OCCUPATIONAL_PHYSICIAN", active: true });
  }
  const access = await client.from("user_organization_access")
    .upsert(accessRows, { onConflict: "user_id,organization_id,role" });
  if (access.error) {
    if (createdNewUser) await client.auth.admin.deleteUser(user.id);
    throw access.error;
  }
  if (generate) writeFileSync(outputPath, `${password}\n`, { flag: "wx", mode: 0o600 });
  console.log(`${rotate ? "Rotated" : "Created"} ${email} as ${role}${organizationCode ? ` for ${organizationCode}` : ""}${alsoPhysicianFor ? ` and OCCUPATIONAL_PHYSICIAN for ${alsoPhysicianFor}` : ""}.`);
  if (generate) console.log(`One-time password saved with mode 0600 to ${outputPath}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provisioning failed");
  process.exitCode = 1;
});
