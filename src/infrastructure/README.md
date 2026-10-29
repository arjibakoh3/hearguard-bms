# Infrastructure layer

`postgres/server-client.ts` verifies the opaque session cookie and creates the server-only PostgreSQL adapter. SQL credentials and user identity never come from browser query parameters. Native authentication and storage are implemented in `server/`.

`repositories/postgres-hearguard-read-repository.ts` implements the application read port. It validates database responses with Zod and maps snake-case persistence rows to application view models. Command and import repositories retain the clinical PostgreSQL transactions. Clinical calculations remain in `src/domain/hearing`.

The database connection role must own the dedicated database and must not have SUPERUSER or BYPASSRLS. Every operational table uses FORCE RLS. Each server query runs on one connection in a transaction with SET LOCAL request identity; commit and rollback clear that identity before pool reuse. Whitelisted clinical RPCs enable a server-only command policy for their transaction, preserving the original SECURITY DEFINER behavior, while `auth.role()` remains `authenticated` so physician and organization checks still run. No arbitrary SQL or general RPC endpoint is exposed. Only the trusted provisioning CLI uses the maintenance identity.

Original spreadsheet bytes live in the private PostgreSQL schema, not the Pod filesystem. Uploads match a staged file manifest and SHA256; downloads require clinical organization access and verify integrity again. Sessions store only token hashes. Database migration history stores checksums and startup refuses to replace existing unrelated tables.

Phase 7 resolves the current actor on the server and exercises organization-specific RLS through hospital administrator, occupational-health staff, and company-user roles.
