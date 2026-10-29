# Infrastructure layer

`supabase/server-client.ts` creates the Supabase SSR client used by interactive requests. It carries the signed-in user's cookies with the public key so organization RLS remains active. `supabase/admin-client.ts` is reserved for explicit trusted maintenance code; its `SUPABASE_SECRET_KEY` must never use a `NEXT_PUBLIC_` name.

`repositories/supabase-hearguard-read-repository.ts` implements the application read port. It validates database responses with Zod and maps snake-case persistence rows to application view models. Command and import repositories use authenticated PostgreSQL transaction wrappers. Clinical calculations remain in `src/domain/hearing`.

Phase 7 resolves the current actor on the server and exercises organization-specific RLS through hospital administrator, occupational-health staff, and company-user roles.
