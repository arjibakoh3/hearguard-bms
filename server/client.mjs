import { createHash } from "node:crypto";
import { withIdentity } from "./connection.mjs";

const tables = new Set(`audiogram_directory audiogram_hearing_condition_snapshots audiogram_history_responses audiogram_otoscopy_findings audiogram_pretest_assessments audiogram_thresholds audiogram_year_directory audiograms audit_log_directory audit_logs baseline_governance_directory baseline_interpretation_suggestions beerthip_import_batches beerthip_import_files beerthip_import_rows department_directory department_population_surveillance departments employee_directory employee_hearing_protector_assignments employees follow_up_cases follow_up_queue hearing_baseline_history hearing_protection_assessments hearing_protectors hospital_audiometers hospital_employee_directory hospital_patient_employment_transitions hospital_patient_hearing_conditions hospital_patients import_batch_directory import_batch_rows import_batches nihl_evidence_assessments noise_exposures organization_directory organization_population_surveillance organizations paperless_audiometry_directory patient_noise_exposure_periods surveillance_evaluations user_organization_access`.split(" "));
const procedures = new Set(`advance_follow_up_case amend_nihl_physician_review assign_hearing_protector_and_record_assessment commit_import_batch complete_employment_transfer finalize_paperless_audiogram lookup_hospital_patient_employments manage_patient_hearing_condition paperless_examiner_options persist_employee_nihl_evidence_assessment persist_nihl_evidence_assessment propose_initial_thai_baseline register_hospital_employee register_hospital_organization replace_analytical_baseline_suggestions review_baseline_suggestion review_beerthip_import_file review_nihl_evidence_assessment save_employee_noise_exposure_period save_import_batch_validation save_paperless_audiogram_draft save_patient_noise_exposure_period stage_beerthip_xlsx_batch upsert_hospital_audiometer`.split(" "));
const writes = { import_batches: ["insert", "delete"], import_batch_rows: ["insert"], hearing_protectors: ["insert", "update"], beerthip_import_files: ["update"] };
const relations = {
  "employees.organizations": { child: "organizations", source: "organization_id", target: "id", many: false },
  "employees.hospital_patients": { child: "hospital_patients", source: "patient_id", target: "id", many: false },
  "audiograms.audiogram_thresholds": { child: "audiogram_thresholds", source: "id", target: "audiogram_id", many: true },
  "nihl_evidence_assessments.nihl_physician_reviews": { child: "nihl_physician_reviews", source: "id", target: "assessment_id", many: false },
};
const identifier = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Unsupported database identifier");
  return `"${name}"`;
};
const errorResult = (error) => ({ data: null, count: null, error: { message: String(error.message ?? "Database operation failed"), code: String(error.code ?? "DATABASE_ERROR") } });

function splitExpressions(text) {
  const parts = []; let level = 0; let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") level += 1;
    if (text[i] === ")") level -= 1;
    if (level < 0) throw new Error("Invalid database expression");
    if (text[i] === "," && level === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  if (level !== 0) throw new Error("Invalid database expression");
  parts.push(text.slice(start).trim());
  return parts;
}

function selection(table, columns, alias = "t") {
  return splitExpressions(columns).map((column) => {
    if (column === "*") return `${alias}.*`;
    const nested = column.match(/^([a-z_][a-z0-9_]*)\(([^()]+)\)$/);
    if (!nested) return `${alias}.${identifier(column)}`;
    const relation = relations[`${table}.${nested[1]}`];
    if (!relation) throw new Error("Unsupported database relationship");
    const fields = splitExpressions(nested[2]).flatMap((name) => [`'${name}'`, `c.${identifier(name)}`]).join(",");
    const object = `jsonb_build_object(${fields})`;
    const value = relation.many ? `coalesce(jsonb_agg(${object}),'[]'::jsonb)` : object;
    return `(select ${value} from public.${identifier(relation.child)} c where c.${identifier(relation.target)}=${alias}.${identifier(relation.source)}${relation.many ? "" : " limit 1"}) as ${identifier(nested[1])}`;
  }).join(",");
}

function filterSql(filter, values) {
  if (filter.group) return `(${filter.items.map((item) => filterSql(item, values)).join(` ${filter.group} `)})`;
  const field = `t.${identifier(filter.column)}`;
  if (filter.operator === "is") {
    if (filter.value !== null && filter.value !== true && filter.value !== false) throw new Error("Invalid IS filter");
    return `${field} is ${filter.value === null ? "null" : filter.value ? "true" : "false"}`;
  }
  if (filter.operator === "in") {
    if (!Array.isArray(filter.value)) throw new Error("Invalid IN filter");
    if (filter.value.length === 0) return "false";
    return `${field} in (${filter.value.map((value) => { values.push(value); return `$${values.length}`; }).join(",")})`;
  }
  const operators = { eq: "=", neq: "<>", gte: ">=", lte: "<=", gt: ">", lt: "<", ilike: "ilike" };
  if (!operators[filter.operator]) throw new Error("Unsupported filter operator");
  if (filter.value === null) return `${field} is ${filter.operator === "neq" ? "not " : ""}null`;
  values.push(filter.value);
  return `${field} ${operators[filter.operator]} $${values.length}`;
}

function parseFilter(expression) {
  const group = expression.match(/^(and|or)\((.*)\)$/s);
  if (group) return { group: group[1], items: splitExpressions(group[2]).map(parseFilter) };
  const match = expression.match(/^([a-z_][a-z0-9_]*)\.(eq|neq|gte|lte|gt|lt|ilike|is)\.(.*)$/s);
  if (!match) throw new Error("Invalid database filter");
  return { column: match[1], operator: match[2], value: match[2] === "is" ? match[3] === "null" ? null : match[3] === "true" ? true : match[3] === "false" ? false : match[3] : match[3] };
}

class Query {
  constructor(client, table) {
    if (!tables.has(table)) throw new Error("Database relation is not exposed to the application");
    this.client = client; this.table = table; this.columns = "*"; this.filters = []; this.sort = []; this.operation = "select";
    this.countExact = false; this.offset = 0; this.maxRows = null; this.cardinality = "many"; this.payload = null; this.returnRows = false;
  }
  select(columns = "*", options = {}) { this.columns = columns; this.countExact = options.count === "exact"; this.returnRows = true; return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  delete() { this.operation = "delete"; return this; }
  eq(column, value) { return this.filter(column, "eq", value); }
  neq(column, value) { return this.filter(column, "neq", value); }
  gte(column, value) { return this.filter(column, "gte", value); }
  lte(column, value) { return this.filter(column, "lte", value); }
  lt(column, value) { return this.filter(column, "lt", value); }
  in(column, value) { return this.filter(column, "in", value); }
  is(column, value) { return this.filter(column, "is", value); }
  filter(column, operator, value) { this.filters.push({ column, operator, value }); return this; }
  or(expression) { this.filters.push({ group: "or", items: splitExpressions(expression).map(parseFilter) }); return this; }
  order(column, options = {}) { identifier(column); this.sort.push({ column, ...options }); return this; }
  limit(value) { if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid query limit"); this.maxRows = value; return this; }
  range(first, last) { if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || last < first) throw new Error("Invalid query range"); this.offset = first; return this.limit(last - first + 1); }
  single() { this.cardinality = "one"; return this; }
  maybeSingle() { this.cardinality = "optional"; return this; }
  then(resolve, reject) { this.promise ??= this.execute(); return this.promise.then(resolve, reject); }

  /** Repository DTOs are validated by the existing Zod schemas. @returns {Promise<{data:any,error:{message:string,code:string}|null,count:number|null}>} */
  async execute() {
    try {
      if (!this.client.user) throw new Error("Authentication required");
      return await withIdentity(this.client.user, async (connection) => {
        const values = [];
        const predicates = this.filters.map((filter) => filterSql(filter, values));
        const where = predicates.length ? ` where ${predicates.join(" and ")}` : "";
        let count = null;
        let sql;
        if (this.operation === "select") {
          if (this.countExact) count = (await connection.query(`select count(*) as count from public.${identifier(this.table)} t${where}`, values)).rows[0].count;
          sql = `select ${selection(this.table, this.columns)} from public.${identifier(this.table)} t${where}`;
          if (this.sort.length) sql += ` order by ${this.sort.map((item) => `t.${identifier(item.column)} ${item.ascending === false ? "desc" : "asc"}${item.nullsFirst === undefined ? "" : item.nullsFirst ? " nulls first" : " nulls last"}`).join(",")}`;
          if (this.maxRows !== null) { values.push(this.maxRows); sql += ` limit $${values.length}`; }
          if (this.offset) { values.push(this.offset); sql += ` offset $${values.length}`; }
        } else {
          if (!writes[this.table]?.includes(this.operation)) throw new Error("Direct mutation is disabled; use an authorized clinical transaction");
          if (this.operation !== "insert" && !this.filters.length) throw new Error("Filtered mutation is required");
          if (this.table === "beerthip_import_files" && Object.keys(this.payload).some((key) => !["source_status", "verified_sha256", "verified_at"].includes(key))) throw new Error("Only original-file verification fields may be updated directly");
          if (this.operation === "delete") sql = `delete from public.${identifier(this.table)} t${where}`;
          if (this.operation === "update") {
            const assignments = Object.entries(this.payload).map(([key, value]) => { values.push(value !== null && typeof value === "object" ? JSON.stringify(value) : value); return `${identifier(key)}=$${values.length}`; });
            sql = `update public.${identifier(this.table)} t set ${assignments.join(",")}${where}`;
          }
          if (this.operation === "insert") {
            const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
            if (!rows.length) return { data: [], error: null, count: null };
            const columns = Object.keys(rows[0]);
            if (rows.some((row) => Object.keys(row).sort().join() !== [...columns].sort().join())) throw new Error("Insert rows must have matching columns");
            const tuples = rows.map((row) => `(${columns.map((column) => { const value = row[column]; values.push(value !== null && typeof value === "object" ? JSON.stringify(value) : value); return `$${values.length}`; }).join(",")})`);
            sql = `insert into public.${identifier(this.table)} as t (${columns.map(identifier).join(",")}) values ${tuples.join(",")}`;
          }
          if (this.returnRows) sql += ` returning ${selection(this.table, this.columns)}`;
        }
        const result = await connection.query(sql, values);
        if (this.cardinality !== "many") {
          if (result.rows.length > 1 || (this.cardinality === "one" && result.rows.length !== 1)) throw Object.assign(new Error("Expected one authorized database row"), { code: "ROW_CARDINALITY" });
          return { data: result.rows[0] ?? null, error: null, count };
        }
        return { data: this.operation === "select" || this.returnRows ? result.rows : null, error: null, count };
      });
    } catch (error) { return errorResult(error); }
  }
}

export class PostgresClient {
  constructor(user = null, auth = {}) {
    this.user = user;
    this.auth = {
      getUser: async () => ({ data: { user: this.user }, error: null }),
      signInWithPassword: async () => { throw new Error("Sign-in requires the server cookie adapter"); },
      signOut: async () => { throw new Error("Sign-out requires the server cookie adapter"); },
      ...auth,
    };
    this.storage = { from: (bucket) => ({
      upload: (path, bytes, options) => this.upload(bucket, path, bytes, options),
      download: (path) => this.download(bucket, path),
    }) };
  }
  from(table) { return new Query(this, table); }
  /** @returns {Promise<{data:any,error:{message:string,code:string}|null,count:number|null}>} */
  async rpc(name, parameters = {}) {
    try {
      if (!this.user || !procedures.has(name)) throw new Error("Authorized application transaction required");
      return await withIdentity(this.user, async (connection) => {
        const metadata = await connection.query(`select p.proargnames[1:p.pronargs] as names,
          array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) as types,p.proretset as set
          from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name]);
        const keys = Object.keys(parameters);
        const candidates = metadata.rows.filter((row) => (row.names ?? []).length === keys.length && keys.every((key) => (row.names ?? []).includes(key)));
        if (candidates.length !== 1) throw new Error("Clinical transaction parameters do not match the database schema");
        const signature = candidates[0];
        const values = [];
        const args = keys.map((key) => {
          const type = signature.types[signature.names.indexOf(key)];
          if (!/^[a-z0-9_ .\[\]"]+$/.test(type)) throw new Error("Unsupported database parameter type");
          const value = parameters[key];
          values.push((type === "jsonb" || type === "json") && value !== null ? JSON.stringify(value) : value);
          return `${identifier(key)} => $${values.length}::${type}`;
        });
        const call = `public.${identifier(name)}(${args.join(",")})`;
        const result = await connection.query(signature.set ? `select * from ${call}` : `select to_jsonb(${call}) as result`, values);
        return { data: signature.set ? result.rows : result.rows[0]?.result ?? null, error: null, count: null };
      }, false, true);
    } catch (error) { return errorResult(error); }
  }
  async upload(bucket, path, bytes, options = {}) {
    try {
      if (!this.user || bucket !== "beerthip-source-xlsx" || bytes.byteLength > 1_000_000) throw new Error("Invalid private original upload");
      const hash = createHash("sha256").update(bytes).digest("hex");
      await withIdentity(this.user, async (connection) => {
        const file = await connection.query("select id,expected_sha256 from public.beerthip_import_files where storage_path=$1 and review_status<>'IMPORTED' and public.can_manage_organization(organization_id) for update", [path]);
        if (file.rows.length !== 1 || file.rows[0].expected_sha256 !== hash) throw new Error("Original-file manifest, hash or organization access does not match");
        await connection.query(`insert into hearguard_auth.private_files(file_id,storage_path,content,sha256,content_type) values($1,$2,$3,$4,$5)
          on conflict(file_id) do update set content=excluded.content,sha256=excluded.sha256,content_type=excluded.content_type,updated_at=now()`, [file.rows[0].id, path, Buffer.from(bytes), hash, options.contentType ?? "application/octet-stream"]);
      });
      return { data: { path }, error: null };
    } catch (error) { return errorResult(error); }
  }
  async download(bucket, path) {
    try {
      if (!this.user || bucket !== "beerthip-source-xlsx") throw new Error("Authorized private original request required");
      const data = await withIdentity(this.user, async (connection) => {
        const { rows } = await connection.query("select content,sha256,content_type from hearguard_auth.private_files where storage_path=$1", [path]);
        if (rows.length !== 1 || createHash("sha256").update(rows[0].content).digest("hex") !== rows[0].sha256) throw new Error("Original is unavailable or failed integrity verification");
        return new Blob([new Uint8Array(rows[0].content)], { type: rows[0].content_type });
      });
      return { data, error: null };
    } catch (error) { return errorResult(error); }
  }
}
