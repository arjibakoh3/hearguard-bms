# HearGuard — BMS deployment source

Private, source-only snapshot of `arjibakoh3/Hearguard` for testing in BMS Developer Portal. This repository starts with a new Git history and excludes database backups, presentations, documents, test fixtures, local secrets, and patient datasets.

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

BMS Cloud runtime compatibility, private Add-on visibility, secret handling, and external Supabase connectivity still require validation before deployment. Do not import clinical records into a test environment.
