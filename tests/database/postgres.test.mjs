import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { migrateDatabase } from "../../scripts/migrate.mjs";
import { PostgresClient } from "../../server/client.mjs";
import { getPool, withIdentity, closeDatabase } from "../../server/connection.mjs";
import { provisionUser, bootstrapAdministrator, signIn, signOut, findSession } from "../../server/identity.mjs";

// Never run fixtures against an operational database.
const database = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : process.env.DB_NAME;
assert.ok(process.env.HEARGUARD_TEST_DATABASE === "1" && database?.endsWith("_test"), "An explicitly enabled, dedicated *_test database is required");
const suffix = randomUUID().slice(0, 8);
const password = `Synthetic-only-password-${suffix}`;
function ok(result) { assert.equal(result.error, null, result.error?.message); return result.data; }

test("Native PostgreSQL authentication, isolation, clinical transactions and durable files", async (t) => {
  t.after(closeDatabase);
  await migrateDatabase();
  await migrateDatabase();
  const pool = getPool();
  const empty = (await pool.query("select count(*) as count from auth.users")).rows[0].count === 0;
  if (empty) {
    const counts = await withIdentity(null, async (c) => (await c.query("select (select count(*) from public.employees)+(select count(*) from public.hospital_patients)+(select count(*) from public.audiograms) as count")).rows[0], true);
    assert.equal(counts.count, 0, "Initial migration must not seed patients or clinical data");
    process.env.HEARGUARD_ADMIN_EMAIL = `bootstrap-${suffix}@example.test`;
    process.env.HEARGUARD_ADMIN_PASSWORD = password;
    await bootstrapAdministrator();
    await bootstrapAdministrator();
    assert.equal((await pool.query("select count(*) as count from auth.users")).rows[0].count, 1);
  }
  const admin = await provisionUser({ email: `admin-${suffix}@example.test`, password, role: "HOSPITAL_ADMIN" });
  const adminClient = new PostgresClient(admin);
  const orgA = ok(await adminClient.rpc("register_hospital_organization", { p_payload: { nameTh: `องค์กรทดสอบ A ${suffix}` } }));
  const orgB = ok(await adminClient.rpc("register_hospital_organization", { p_payload: { nameTh: `องค์กรทดสอบ B ${suffix}` } }));
  const accounts = {};
  for (const [name, role, code] of [
    ["staff", "OCCUPATIONAL_HEALTH_STAFF", orgA.code],
    ["physician", "OCCUPATIONAL_PHYSICIAN", orgA.code],
    ["companyA", "COMPANY_USER", orgA.code],
    ["companyB", "COMPANY_USER", orgB.code],
  ]) accounts[name] = await provisionUser({ email: `${name.toLowerCase()}-${suffix}@example.test`, password, role, organizationCode: code });
  const staff = new PostgresClient(accounts.staff);
  const companyA = new PostgresClient(accounts.companyA);
  const companyB = new PostgresClient(accounts.companyB);
  const hospitalNumber = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const payload = { organizationId: orgA.organizationId, hospitalNumber, employeeNumber: `TEST-${suffix}`, firstName: "ข้อมูล", lastName: "สมมติ", sex: "FEMALE", dateOfBirth: "1990-01-01" };
  const employee = ok(await staff.rpc("register_hospital_employee", { p_payload: payload }));

  await t.test("Password hashing, opaque expiring sessions, throttling and rotation", async () => {
    assert.equal(await signIn(admin.email, "incorrect synthetic password"), null);
    const login = await signIn(admin.email.toUpperCase(), password);
    assert.ok(login);
    assert.equal((await findSession(login.token)).id, admin.id);
    const row = (await pool.query("select encrypted_password from auth.users where id=$1", [admin.id])).rows[0];
    assert.match(row.encrypted_password, /^scrypt\$/);
    assert.ok(!row.encrypted_password.includes(password));
    assert.equal((await pool.query("select count(*) as count from hearguard_auth.sessions where token_hash=$1", [login.token])).rows[0].count, 0);
    await signOut(login.token);
    assert.equal(await findSession(login.token), null);
    const beforeRotation = await signIn(admin.email, password);
    await provisionUser({ email: admin.email, password: `${password}-rotated`, role: "HOSPITAL_ADMIN", rotate: true });
    assert.equal(await findSession(beforeRotation.token), null);
    assert.equal(await signIn(admin.email, password), null);
    assert.ok(await signIn(admin.email, `${password}-rotated`));
    for (let i = 0; i < 5; i += 1) assert.equal(await signIn(accounts.companyB.email, "invalid password"), null);
    assert.equal(await signIn(accounts.companyB.email, password), null, "Throttled account must not receive a session");
    assert.equal(await findSession("forged-session"), null);
  });

  await t.test("RLS is enforced for the owner, scoped views and nested HN data", async () => {
    const roles = (await pool.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0];
    assert.deepEqual(roles, { rolsuper: false, rolbypassrls: false });
    const unprotected = await pool.query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)");
    assert.deepEqual(unprotected.rows, []);
    assert.equal((await pool.query("select count(*) as count from public.employees")).rows[0].count, 0, "A pooled connection without request identity must see no clinical rows");
    const a = ok(await companyA.from("employees").select("id,organization_id,organizations(id,code),hospital_patients(hospital_number)"));
    assert.equal(a.length, 1);
    assert.equal(a[0].organizations.id, orgA.organizationId);
    assert.equal(a[0].hospital_patients, null, "Company users cannot obtain hospital HN through a relationship");
    assert.deepEqual(ok(await companyB.from("employees").select("id")), []);
    assert.deepEqual(ok(await companyB.from("employee_directory").select("id").eq("organization_id", orgA.organizationId)), []);
    const clinical = ok(await staff.from("employees").select("id,hospital_patients(hospital_number)").eq("id", employee.employeeId).single());
    assert.equal(clinical.hospital_patients.hospital_number, hospitalNumber);
    assert.deepEqual(ok(await companyA.from("hospital_patients").select("id")), []);
  });

  await t.test("Clinical RPCs retain actor permissions and rollback atomically", async () => {
    const denied = await companyA.rpc("register_hospital_employee", { p_payload: { ...payload, employeeNumber: "DENIED" } });
    assert.equal(denied.error?.code, "42501");
    assert.equal((await staff.rpc("register_hospital_employee", { p_payload: { ...payload, organizationId: orgB.organizationId } })).error?.code, "42501");
    assert.equal((await staff.rpc("register_hospital_organization", { p_payload: { nameTh: "Unauthorized test" } })).error?.code, "42501");
    const checks = await withIdentity(admin, async (c) => (await c.query("select public.can_review_baseline($1) as physician,auth.role() as role", [orgA.organizationId])).rows[0]);
    assert.deepEqual(checks, { physician: false, role: "authenticated" });
    assert.equal(await withIdentity(accounts.physician, async (c) => (await c.query("select public.can_review_baseline($1) as permitted", [orgA.organizationId])).rows[0].permitted), true);
    const invalidHn = String((Number(hospitalNumber) + 1) % 10_000_000).padStart(7, "0");
    const failed = await staff.rpc("register_hospital_employee", { p_payload: { ...payload, hospitalNumber: invalidHn, employeeNumber: "ROLLBACK", sex: "INVALID" } });
    assert.ok(failed.error);
    assert.equal(ok(await staff.rpc("lookup_hospital_patient_employments", { p_hospital_number: invalidHn })), null, "Failed registration must rollback its patient insert");
    assert.ok((await adminClient.rpc("is_hospital_admin")).error, "Internal SQL helpers must not be exposed as RPCs");
    assert.ok((await staff.from("audiograms").update({ status: "FINAL" }).eq("id", randomUUID())).error);
    assert.ok((await staff.from("audit_logs").delete().eq("organization_id", orgA.organizationId)).error);
  });

  await t.test("Paperless draft persists fourteen thresholds with native dates and examiner identity", async () => {
    const audiometer = ok(await adminClient.rpc("upsert_hospital_audiometer", { p_payload: {
      displayName: `Synthetic ${suffix}`, model: "Test model", serialNumber: suffix, location: "Test room", calibrationDate: "2026-01-01", active: true,
    } }));
    const thresholds = ["LEFT", "RIGHT"].flatMap((ear) => [500, 1000, 2000, 3000, 4000, 6000, 8000].map((frequencyHz) => ({ ear, frequencyHz, responseStatus: "MEASURED", thresholdDbHl: 15 })));
    const input = { organizationId: orgA.organizationId, employeeId: employee.employeeId, audiometerId: audiometer,
      examinerUserId: accounts.staff.id, examType: "BASELINE", examinedAt: "2026-06-01T02:30:00.000Z",
      isValid: true, thresholds, pretest: { historyCaptureMode: "QUICK_SCREEN", quietPeriodAnswer: "YES", quietPeriodHours: 14 },
      importantHistory: { captureMode: "CONFIRMED_CURRENT", conditions: [] },
    };
    const draft = ok(await staff.rpc("save_paperless_audiogram_draft", { p_audiogram_id: null, p_payload: input }));
    const row = ok(await staff.from("audiograms").select("id,exam_date,examined_at,examiner_user_id,record_status,audiogram_thresholds(ear,frequency_hz,threshold_db_hl)").eq("id", draft).single());
    assert.equal(row.record_status, "DRAFT"); assert.equal(row.exam_date, "2026-06-01");
    assert.equal(row.examined_at, "2026-06-01T02:30:00.000Z"); assert.equal(row.examiner_user_id, accounts.staff.id);
    assert.equal(row.audiogram_thresholds.length, 14);
    assert.equal(Number(row.audiogram_thresholds[0].threshold_db_hl), 15);
    assert.deepEqual(ok(await companyA.from("audiograms").select("id").eq("id", draft)), [], "Company users cannot read unfinished clinical drafts");
    assert.ok((await companyA.rpc("save_paperless_audiogram_draft", { p_audiogram_id: draft, p_payload: input })).error);
    const examiners = ok(await staff.rpc("paperless_examiner_options"));
    assert.ok(examiners.some((entry) => entry.id === accounts.staff.id));
  });

  await t.test("Parameters, query cardinality, pagination and pool identity isolation", async () => {
    const paged = await staff.from("employees").select("id", { count: "exact" }).order("id").range(0, 0);
    assert.equal(paged.count, 1); assert.equal(ok(paged).length, 1);
    assert.deepEqual(ok(await staff.from("employees").select("id").eq("employee_number", "' OR true --")), []);
    assert.deepEqual(ok(await staff.from("employees").select("id").or("employee_number.eq.' OR true --")), []);
    assert.ok((await staff.from("employees").select("id; select * from auth.users")).error);
    assert.throws(() => staff.from("auth.users"));
    assert.equal(ok(await staff.from("employees").select("id").eq("id", randomUUID()).maybeSingle()), null);
    assert.ok((await staff.from("employees").select("id").eq("id", randomUUID()).single()).error);
    await assert.rejects(withIdentity(admin, async (c) => { await c.query("select 1/0"); }));
    const reads = await Promise.all(Array.from({ length: 16 }, (_, i) => (i % 2 ? companyA : companyB).from("employees").select("id")));
    reads.forEach((result, i) => assert.equal(ok(result).length, i % 2 ? 1 : 0));
    assert.equal((await pool.query("select nullif(current_setting('request.jwt.claims',true),'') as claims,nullif(current_setting('hearguard.command',true),'') as command")).rows[0].claims, null);
  });

  await t.test("Catalog writes are audited and company writes rejected", async () => {
    const protector = { organization_id: orgA.organizationId, manufacturer: "Synthetic", model: suffix, protector_type: "EARMUFF", nrr_db: 20 };
    const created = ok(await staff.from("hearing_protectors").insert(protector).select("id").single());
    ok(await staff.from("hearing_protectors").update({ nrr_db: 22 }).eq("id", created.id));
    assert.ok((await companyA.from("hearing_protectors").insert({ ...protector, model: "DENIED" })).error);
    assert.ok((await staff.from("hearing_protectors").insert({ ...protector, organization_id: orgB.organizationId })).error);
    const audit = ok(await staff.from("audit_logs").select("user_id,entity_id,action").eq("entity_id", created.id));
    assert.equal(audit.length, 2);
    audit.forEach((row) => assert.equal(row.user_id, accounts.staff.id));
  });

  await t.test("Original files persist in PostgreSQL, verify SHA256 and enforce clinical access", async () => {
    const bytes = Buffer.from(`synthetic original ${suffix}`);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const file = await withIdentity(null, async (c) => {
      const batch = (await c.query(`insert into public.beerthip_import_batches(organization_id,file_count,row_count,ready_count,source_files_json,department_proposals_json)
        values($1,1,1,1,$2,'[]') returning id`, [orgA.organizationId, JSON.stringify([{ name: "synthetic.xlsx", sha256: hash }])])).rows[0];
      return (await c.query("select id,storage_path from public.beerthip_import_files where batch_id=$1", [batch.id])).rows[0];
    }, true);
    assert.ok((await staff.storage.from("beerthip-source-xlsx").upload(file.storage_path, Buffer.from("wrong hash"))).error);
    ok(await staff.storage.from("beerthip-source-xlsx").upload(file.storage_path, bytes, { contentType: "application/octet-stream" }));
    ok(await staff.from("beerthip_import_files").update({ source_status: "VERIFIED", verified_sha256: hash, verified_at: new Date().toISOString() }).eq("id", file.id));
    assert.ok((await companyA.storage.from("beerthip-source-xlsx").download(file.storage_path)).error);
    assert.ok((await companyB.storage.from("beerthip-source-xlsx").download(file.storage_path)).error);
    assert.ok((await companyB.storage.from("beerthip-source-xlsx").upload(file.storage_path, bytes)).error);
    await closeDatabase();
    const retrieved = ok(await new PostgresClient(accounts.physician).storage.from("beerthip-source-xlsx").download(file.storage_path));
    assert.deepEqual(Buffer.from(await retrieved.arrayBuffer()), bytes);
  });
});
