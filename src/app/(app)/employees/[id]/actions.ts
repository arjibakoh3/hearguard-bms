"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getHearGuardBaselineGovernanceService } from "@/lib/server/hearguard-baseline-governance-service";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { getHearGuardHearingProtectionService } from "@/lib/server/hearguard-hearing-protection-service";
import { requireManagingActor } from "@/lib/server/current-actor";

export async function prepareBaselineSuggestions(formData: FormData) {
  await requireManagingActor();
  const employeeId = z.string().uuid().parse(formData.get("employeeId"));
  const profile = await getHearGuardReadService().getEmployeeProfile(employeeId);
  if (!profile) throw new Error("Employee profile not found");
  const created = await getHearGuardBaselineGovernanceService().prepareSuggestions(profile);
  revalidatePath("/baseline-governance");
  revalidatePath(`/employees/${employeeId}`);
  redirect(`/baseline-governance?prepared=${created}`);
}

export async function assignHearingProtector(formData: FormData) {
  await requireManagingActor();
  const employeeId = z.string().uuid().parse(formData.get("employeeId"));
  try {
    await getHearGuardHearingProtectionService().assignProtector({
      employeeId,
      hearingProtectorId: z.string().uuid().parse(formData.get("hearingProtectorId")),
      secondaryHearingProtectorId: z.string().uuid().nullable().parse(
        formData.get("secondaryHearingProtectorId") || null,
      ),
      configuration: z.enum(["SINGLE", "DUAL_UNSUPPORTED"]).parse(
        formData.get("configuration"),
      ),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(
        formData.get("effectiveFrom"),
      ),
      notes: z.string().trim().max(1000).nullable().parse(
        formData.get("notes") || null,
      ),
    });
    revalidatePath(`/employees/${employeeId}`);
    revalidatePath(`/companies`);
    redirect(`/employees/${employeeId}?protection=saved`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกอุปกรณ์ป้องกันเสียงได้";
    redirect(`/employees/${employeeId}?protectionError=${encodeURIComponent(message.slice(0, 500))}`);
  }
}
