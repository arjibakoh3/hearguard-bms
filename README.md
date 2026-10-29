# HearGuard for BMS Developer Portal

Next.js application using native PostgreSQL for clinical records, accounts, sessions and private spreadsheet originals. Supabase is no longer required. This public repository has a fresh Git history and contains no patient datasets, database backups, demo accounts or report signatures.

The application and clinical SQL originate from private HearGuard revision `defe5bd7ac909f3dce5159a1b4637a9a47d723e4`. The database migration contains schema, clinical functions and rule configuration only. Existing clinical calculations, physician approval rules and immutable audit records are retained.

## BMS settings

| Field | Value |
| --- | --- |
| Platform | **Dedicated Pod** |
| Repository | `hearguard-bms` |
| Branch | `main` |
| Dockerfile | `Dockerfile` |
| Container port | **3000** |
| Pods | **1** for initial deployment |
| Database | Select the PostgreSQL database **hearguard** |
| Auto-fix build errors with AI | **Off** while the Claude gateway is failing |

Selecting the database lets BMS inject `DATABASE_URL`, or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`. Do not paste database credentials into source code. No `NEXT_PUBLIC_SUPABASE_*` or Supabase secret is needed.

Add these two private environment variables before the first deployment:

- `HEARGUARD_ADMIN_EMAIL`: the email you will use to log in.
- `HEARGUARD_ADMIN_PASSWORD`: your own unique password, **16-128 characters**.

Use the email and password on HearGuard's login page. The initial account is a hospital administrator; it is not automatically assigned the physician role. Initial startup creates database tables and this account without loading patients or demo data. After successful first login, remove the bootstrap password from BMS environment variables. Subsequent startups do not reset existing accounts.

PostgreSQL must be version 15 or newer. The application connection must own this dedicated database and must have neither `SUPERUSER` nor `BYPASSRLS`. The initial migration requires an empty database and permission to create schemas and the trusted `pgcrypto` and `btree_gist` extensions. If BMS blocks these permissions, ask its database administrator to prepare a suitable owner account and extensions. Do not grant the application superuser rights. Existing unrelated tables are never replaced.

Importing GitHub into BMS creates a Gitea copy. **Sync or re-import the updated GitHub repository before building**, and verify the latest commit and root Dockerfile in BMS's Git repository. Auto-deploy after a Gitea push does not itself synchronize GitHub changes.

## Accounts and organizations

Create an organization from **Companies > New** as the initial administrator. Provision additional accounts from a trusted terminal with database environment variables available:

```sh
node scripts/provision-user.mjs --email staff@example.org --role OCCUPATIONAL_HEALTH_STAFF --organization-code ORG_FROM_UI --name 'Staff name'
node scripts/provision-user.mjs --email doctor@example.org --role OCCUPATIONAL_PHYSICIAN --organization-code ORG_FROM_UI --name 'Physician name'
node scripts/provision-user.mjs --email company@example.org --role COMPANY_USER --organization-code ORG_FROM_UI
```

The CLI prompts for a hidden password. To rotate an existing account password, repeat its provisioning command with `--rotate`; all existing sessions for that account are revoked. Rotation preserves existing role assignments. A hospital administrator who is also an authorized physician can be provisioned with `--role HOSPITAL_ADMIN --also-physician-for ORG_FROM_UI`. Physician approval remains organization-scoped.

The specialized Beerthip spreadsheet workflow still expects the pre-existing organization code `BEERTHIP_1991`. This deployment does not automatically create a real company or import any company data. The general company and audiometry workflows start with the organizations created by the administrator.

## Storage and reports

Original XLSX bytes are stored in PostgreSQL, with private organization permissions and SHA256 verification. They survive application Pod replacement. Database backup/restore must therefore include the `auth`, `hearguard_auth`, `hearguard_meta` and `public` schemas. The application does not depend on writable persistent Pod storage for these originals.

Before printing signed reports, configure private BMS environment variables `HEARGUARD_REPORT_SIGNER_NAME`, `HEARGUARD_REPORT_SIGNER_LICENSE` and `HEARGUARD_REPORT_SIGNATURE_BASE64` (base64 of the approved transparent RGBA PNG, up to about 1 MB). The signature is loaded only after report authorization and is never committed to this repository. Reports remain unsigned/unavailable for signed printing until this configuration is supplied.

## Local checks

Use Node.js 22 and pnpm 10.15.0. Copy `.env.example` to private `.env.local` and replace its placeholders with an empty local database owned by a non-superuser application role.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

The Docker entrypoint runs checksum-verified migrations under an advisory lock, provisions the first administrator if needed, and starts the Next.js standalone server as the unprivileged `node` OS user. A failed migration stops startup with a diagnostic instead of starting against a partially migrated database. Local `pnpm start` starts Next.js only; run migrations and provision an account first.

Database integration tests require a separate database whose name ends in `_test`, plus `HEARGUARD_TEST_DATABASE=1`. Tests use synthetic identities and records, never an operational database. GitHub Actions checks TypeScript/lint, authentication/session handling, company isolation, physician permissions, audit attribution, transaction rollback and durable private files. It also builds the Linux production container against a second fresh PostgreSQL database, logs in through the actual web form, and renders protected pages.

This deployment uses HearGuard's own login. BMS SSO, Session API and HOSxP HN/VN/AN transfer are not implemented. Connectivity and hospital workflow acceptance still need validation on the actual BMS cluster before operational use.
