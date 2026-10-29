"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManagingActor } from "@/lib/server/current-actor";
import { getHearGuardHearingProtectionService } from "@/lib/server/hearguard-hearing-protection-service";

function nullableRating(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("ค่า attenuation ต้องเป็นตัวเลข");
  return parsed;
}

export async function upsertHearingProtector(formData: FormData) {
  await requireManagingActor();
  const organizationId = z.string().uuid().parse(formData.get("organizationId"));
  try {
    await getHearGuardHearingProtectionService().upsertProtector({
      id: z.string().uuid().nullable().parse(formData.get("id") || null),
      organizationId,
      manufacturer: z.string().parse(formData.get("manufacturer")),
      model: z.string().parse(formData.get("model")),
      protectorType: z.enum(["EARMUFF", "FOAM_EARPLUG", "OTHER_EARPLUG"]).parse(
        formData.get("protectorType"),
      ),
      nrrDb: nullableRating(formData.get("nrrDb")),
      snrDb: nullableRating(formData.get("snrDb")),
      active: formData.get("active") === "on",
      notes: z.string().trim().max(1000).nullable().parse(formData.get("notes") || null),
    });
    revalidatePath(`/companies/${organizationId}/hearing-protection`);
    revalidatePath(`/companies/${organizationId}`);
    redirect(`/companies/${organizationId}/hearing-protection?saved=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกอุปกรณ์ได้";
    redirect(`/companies/${organizationId}/hearing-protection?error=${encodeURIComponent(message.slice(0, 500))}`);
  }
}
