import pg from "pg";

pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1114, (value) => new Date(`${value}Z`).toISOString());
pg.types.setTypeParser(1184, (value) => new Date(value).toISOString());
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds the supported range");
  return number;
});

let pool;
let checked;
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString && !(process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER)) {
      throw new Error("PostgreSQL is not configured. Select the BMS PostgreSQL database to inject DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASS.");
    }
    pool = new pg.Pool({
      ...(connectionString ? { connectionString } : {
        host: process.env.DB_HOST, database: process.env.DB_NAME,
        user: process.env.DB_USER, password: process.env.DB_PASS,
        port: Number(process.env.DB_PORT ?? 5432),
      }),
      max: Number(process.env.HEARGUARD_POOL_MAX ?? 4),
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      application_name: "hearguard-bms",
    });
    pool.on("error", () => console.error("PostgreSQL idle connection failed"));
  }
  return pool;
}

export async function checkDatabaseRole() {
  if (!checked) checked = (async () => {
    const { rows } = await getPool().query("select rolsuper,rolbypassrls,current_setting('server_version_num')::int as version from pg_roles where rolname=current_user");
    if (!rows[0] || rows[0].rolsuper || rows[0].rolbypassrls) {
      throw new Error("HearGuard requires a database owner without SUPERUSER or BYPASSRLS. Use the BMS application database account.");
    }
    if (rows[0].version < 150000) throw new Error("HearGuard requires PostgreSQL 15 or newer");
  })();
  return checked;
}

// All request queries share one checked-out connection and one transaction.
// SET LOCAL identity disappears at COMMIT/ROLLBACK before the connection is reused.
export async function withIdentity(user, operation, maintenance = false, trustedCommand = false) {
  await checkDatabaseRole();
  const connection = await getPool().connect();
  try {
    await connection.query("begin");
    await connection.query("set local row_security=on");
    await connection.query("set local statement_timeout='60s'");
    await connection.query("set local lock_timeout='10s'");
    const claims = { sub: user?.id ?? null, email: user?.email ?? null, role: maintenance ? "service_role" : user ? "authenticated" : "anon" };
    await connection.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    await connection.query("select set_config('hearguard.command',$1,true)", [trustedCommand ? "on" : "off"]);
    const result = await operation(connection);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
}

export async function closeDatabase() {
  if (pool) await pool.end();
  pool = undefined;
  checked = undefined;
}
