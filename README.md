# HearGuard — BMS deployment source

Public, source-only snapshot of `arjibakoh3/Hearguard` for testing in BMS Developer Portal. This repository starts with a new Git history and excludes database backups, presentations, documents, test fixtures, local secrets, and patient datasets.

Source revision: `defe5bd7ac909f3dce5159a1b4637a9a47d723e4`.

## Scope

- Next.js application source, public UI assets, package and build configuration, and the account-provisioning script.
- Supabase database migrations and clinical data remain in the original private repository. Provision and review a separate Supabase environment before using this app.
- The app still uses Supabase Auth and its own login. No BMS Session API, HN/VN/AN transfer, or SSO is implemented.

## Build

Use Node.js 20.9+ and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the approved Supabase environment. `SUPABASE_SECRET_KEY` is needed only for trusted private-file and account-maintenance operations; never expose it through a `NEXT_PUBLIC_` variable or commit it. See `.env.example`.

Signed reports require `private/report-assets/physician-signature.png` at runtime. The image is deliberately absent from Git. Provision it through an approved private deployment mechanism before enabling signed report printing.

## BMS Developer Portal

Use **Dedicated Pod**. This application requires a Next.js server and cannot run on the Shared (SPA) platform.

| Field | Value |
| --- | --- |
| Branch | `main` |
| Dockerfile | `Dockerfile` |
| Container port | `3000` |
| Pods | `1` for the initial test |

The Dockerfile builds a standalone Next.js server on Node.js 22, copies its static and public assets, and runs as an unprivileged user. `.dockerignore` allows only build inputs, excluding environment files, patient data, local builds, private assets and Git history.

Set the approved Supabase URL and publishable key in the Portal's container environment variables. These values are read by server code; the container is built without environment files. Provision the trusted server secret only when the relevant private-file operations are enabled. Database setup remains a separate prerequisite.

Importing GitHub into BMS creates a Gitea copy. Before rebuilding, sync or re-import the updated GitHub source and confirm that the root `Dockerfile` is present in the selected BMS repository. Auto-deploy on a Gitea push does not establish GitHub-to-Gitea synchronization.

For this build retry, disable **Auto-fix build errors with AI** if Claude CLI is returning a malformed stream. That gateway failure is separate from the Docker build and is not needed to build this repository.

GitHub Actions builds the Linux container and checks the login page, static assets and anonymous route protection using synthetic configuration. It does not connect to a clinical database. External Supabase connectivity, secret handling and Add-on visibility still require validation in BMS before operational use.
