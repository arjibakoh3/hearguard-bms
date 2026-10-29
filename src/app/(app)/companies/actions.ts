"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireHospitalAdmin } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";

const OrganizationSchema = z.object({
  nameTh: z.string().trim().min(1, "กรุณาระบุชื่อบริษัทภาษาไทย").max(300),
  name: z.string().trim().max(300).optional(),
  returnTo: z.string().optional(),
});

function errorText(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(" · ").slice(0, 500);
  }
  return error instanceof Error ? error.message.slice(0, 500) : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

function safeReturnTo(value: string | undefined): string {
  return value === "/paperless-audiometry/new" ? value : "/companies";
}

export async function createHospitalOrganization(formData: FormData) {
  await requireHospitalAdmin();
  let destination = "/companies/new";
  const returnTo = safeReturnTo(typeof formData.get("returnTo") === "string"
    ? String(formData.get("returnTo"))
    : undefined);
  try {
    const input = OrganizationSchema.parse({
      nameTh: formData.get("nameTh"),
      name: formData.get("name"),
      returnTo,
    });
    const result = await getHearGuardPaperlessAudiometryService().registerOrganization({
      nameTh: input.nameTh,
      name: input.name || null,
    });
    revalidatePath("/companies");
    revalidatePath("/paperless-audiometry");
    const separator = returnTo.includes("?") ? "&" : "?";
    destination = `${returnTo}${separator}organization=${result.organizationId}&companyCreated=1`;
  } catch (error) {
    destination = `/companies/new?returnTo=${encodeURIComponent(returnTo)}&error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function completeHospitalEmploymentTransfer(formData: FormData) {
  await requireHospitalAdmin();
  let destination = "/companies/employment-transfers";
  try {
    const transitionId = z.string().uuid().parse(formData.get("transitionId"));
    await getHearGuardPaperlessAudiometryService().completeEmploymentTransfer(transitionId);
    revalidatePath("/companies/employment-transfers");
    revalidatePath("/employees");
    revalidatePath("/paperless-audiometry");
    destination = "/companies/employment-transfers?completed=1";
  } catch (error) {
    destination = `/companies/employment-transfers?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}
