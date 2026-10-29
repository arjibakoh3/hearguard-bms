import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/admin-client";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { getCurrentActor } from "@/lib/server/current-actor";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: {
  params: Promise<{ id: string; fileId: string }>;
}) {
  const { id, fileId } = await context.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(fileId).success) {
    return new Response("Invalid file", { status: 400 });
  }
  const actor = await getCurrentActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const client = await createSupabaseServerClient();
  const fileResult = await client.from("beerthip_import_files").select("*")
    .eq("id", fileId).eq("batch_id", id).maybeSingle();
  const file = fileResult.data;
  if (fileResult.error || !file) return new Response("Not found", { status: 404 });
  const permitted = actor.role === "HOSPITAL_ADMIN" ||
    ((actor.role === "OCCUPATIONAL_HEALTH_STAFF" || actor.role === "OCCUPATIONAL_PHYSICIAN")
      && actor.organizationIds.includes(file.organization_id));
  if (!permitted) return new Response("Forbidden", { status: 403 });
  if (file.source_status !== "VERIFIED") return new Response("Original not verified", { status: 409 });
  const downloaded = await createSupabaseAdminClient().storage.from("beerthip-source-xlsx")
    .download(file.storage_path);
  if (downloaded.error || !downloaded.data) return new Response("Original unavailable", { status: 503 });
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== file.expected_sha256) {
    return new Response("Original hash mismatch", { status: 409 });
  }
  const safeName = String(file.source_filename).replace(/[^A-Za-z0-9_.-]/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
