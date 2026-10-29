import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getPool, checkDatabaseRole, withIdentity } from "./connection.mjs";

const scrypt = promisify(scryptCallback);
const SESSION_SECONDS = 8 * 60 * 60;
export const sessionSeconds = SESSION_SECONDS;
export function sessionCookieName() { return process.env.NODE_ENV === "production" ? "__Host-hearguard_session" : "hearguard_session"; }
const digest = (value) => createHash("sha256").update(value).digest("hex");

export async function passwordHash(password) {
  const salt = randomBytes(24).toString("base64url");
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

async function passwordMatches(password, stored) {
  const parts = typeof stored === "string" ? stored.split("$") : [];
  const valid = parts.length === 3 && parts[0] === "scrypt" && /^[\w-]{32}$/.test(parts[1]) && /^[\w-]{86}$/.test(parts[2]);
  const hash = await scrypt(password, valid ? parts[1] : "hearguard-unknown-user-dummy-salt", 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return valid && timingSafeEqual(hash, Buffer.from(parts[2], "base64url"));
}

function publicUser(row) {
  return row ? { id: row.id, email: row.email, user_metadata: row.raw_user_meta_data ?? {} } : null;
}

export async function findSession(token) {
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  await checkDatabaseRole();
  const { rows } = await getPool().query(`select u.id,u.email,u.raw_user_meta_data
    from hearguard_auth.sessions s join auth.users u on u.id=s.user_id
    where s.token_hash=$1 and s.expires_at>now() and u.active`, [digest(token)]);
  return publicUser(rows[0]);
}

export async function signIn(email, password) {
  await checkDatabaseRole();
  const identifier = digest(String(email).trim().toLowerCase());
  const connection = await getPool().connect();
  try {
    await connection.query("begin");
    await connection.query("insert into hearguard_auth.login_throttles(identifier_hash) values($1) on conflict do nothing", [identifier]);
    const { rows: throttle } = await connection.query("select failures,window_start from hearguard_auth.login_throttles where identifier_hash=$1 for update", [identifier]);
    const fresh = Date.now() - new Date(throttle[0].window_start).getTime() < 15 * 60 * 1000;
    if (fresh && throttle[0].failures >= 5) {
      await connection.query("commit");
      return null;
    }
    if (!fresh) await connection.query("update hearguard_auth.login_throttles set failures=0,window_start=now() where identifier_hash=$1", [identifier]);
    const { rows } = await connection.query("select id,email,raw_user_meta_data,encrypted_password,active from auth.users where email=$1", [String(email).trim().toLowerCase()]);
    const valid = await passwordMatches(password, rows[0]?.encrypted_password);
    if (!valid || !rows[0]?.active) {
      await connection.query("update hearguard_auth.login_throttles set failures=failures+1 where identifier_hash=$1", [identifier]);
      await connection.query("commit");
      return null;
    }
    const token = randomBytes(32).toString("base64url");
    await connection.query("delete from hearguard_auth.login_throttles where identifier_hash=$1", [identifier]);
    await connection.query("delete from hearguard_auth.sessions where expires_at<=now()");
    await connection.query("insert into hearguard_auth.sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '8 hours')", [digest(token), rows[0].id]);
    await connection.query("commit");
    return { token, user: publicUser(rows[0]) };
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally { connection.release(); }
}

export async function signOut(token) {
  if (token && /^[\w-]{43}$/.test(token)) await getPool().query("delete from hearguard_auth.sessions where token_hash=$1", [digest(token)]);
}

export async function provisionUser({ email, password, role, organizationCode = null, alsoPhysicianFor = null, rotate = false, fullName = "" }) {
  const roles = new Set(["HOSPITAL_ADMIN", "OCCUPATIONAL_HEALTH_STAFF", "OCCUPATIONAL_PHYSICIAN", "COMPANY_USER"]);
  const normalized = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || password.length < 16 || password.length > 128 || !roles.has(role)) throw new Error("Invalid account details or password length (16-128 required)");
  if (role !== "HOSPITAL_ADMIN" && !organizationCode) throw new Error("Organization assignment is required");
  if (role === "HOSPITAL_ADMIN" && organizationCode) throw new Error("Hospital administrator is hospital-wide");
  if (alsoPhysicianFor && role !== "HOSPITAL_ADMIN") throw new Error("Additional physician assignment requires administrator provisioning");
  const hash = await passwordHash(password);
  return withIdentity(null, async (connection) => {
    await connection.query("select pg_advisory_xact_lock(642918277)");
    const existing = await connection.query("select id from auth.users where email=$1 for update", [normalized]);
    if (existing.rows.length && !rotate) throw new Error("Account exists; use --rotate explicitly");
    const user = existing.rows.length
      ? (await connection.query("update auth.users set encrypted_password=$1,active=true,updated_at=now() where id=$2 returning id,email", [hash, existing.rows[0].id])).rows[0]
      : (await connection.query("insert into auth.users(email,encrypted_password,raw_user_meta_data) values($1,$2,$3) returning id,email", [normalized, hash, { full_name: fullName }])).rows[0];
    const assignments = [[role, organizationCode], ...(alsoPhysicianFor ? [["OCCUPATIONAL_PHYSICIAN", alsoPhysicianFor]] : [])];
    for (const [assignedRole, code] of assignments) {
      let organizationId = null;
      if (code) {
        const organization = await connection.query("select id from public.organizations where code=$1 and active", [code]);
        if (!organization.rows.length) throw new Error("Organization was not found");
        organizationId = organization.rows[0].id;
      }
      const found = await connection.query("select id from public.user_organization_access where user_id=$1 and role=$2 and organization_id is not distinct from $3", [user.id, assignedRole, organizationId]);
      if (found.rows.length) await connection.query("update public.user_organization_access set active=true where id=$1", [found.rows[0].id]);
      else await connection.query("insert into public.user_organization_access(user_id,role,organization_id) values($1,$2,$3)", [user.id, assignedRole, organizationId]);
    }
    await connection.query("delete from hearguard_auth.sessions where user_id=$1", [user.id]);
    return user;
  }, true);
}

export async function bootstrapAdministrator() {
  await checkDatabaseRole();
  const { rows } = await getPool().query("select count(*) as count from auth.users");
  if (rows[0].count !== 0) return;
  const email = process.env.HEARGUARD_ADMIN_EMAIL;
  const password = process.env.HEARGUARD_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("First startup requires HEARGUARD_ADMIN_EMAIL and HEARGUARD_ADMIN_PASSWORD (16-128 characters) in BMS secrets");
  await provisionUser({ email, password, role: "HOSPITAL_ADMIN" });
  console.log("Initial hospital administrator created; no clinical data was seeded");
}
