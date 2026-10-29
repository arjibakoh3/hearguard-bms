"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBaselineReviewer } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";

const PhysicianConditionSchema = z.object({
  patientId: z.string().uuid(),
  employeeId: z.string().uuid(),
  category: z.enum([
    "PRE_EXISTING_HEARING_LOSS",
    "PRE_EXISTING_HEARING_DISABILITY",
    "OTHER_IMPORTANT_HEARING_HISTORY",
  ]),
  earScope: z.enum(["LEFT", "RIGHT", "BOTH", "UNKNOWN"]),
  onset: z.enum(["CONGENITAL_OR_CHILDHOOD", "LATER", "UNKNOWN"]),
  details: z.string().trim().max(2000),
});

export async function addPhysicianConfirmedHearingCondition(formData: FormData) {
  await requireBaselineReviewer();
  let patientId = String(formData.get("patientId") ?? "");
  try {
    const input = PhysicianConditionSchema.parse({
      patientId,
      employeeId: formData.get("employeeId"),
      category: formData.get("category"),
      earScope: formData.get("earScope"),
      onset: formData.get("onset"),
      details: formData.get("details"),
    });
    patientId = input.patientId;
    await getHearGuardPaperlessAudiometryService().manageImportantHearingCondition({
      employeeId: input.employeeId,
      condition: {
        id: null,
        category: input.category,
        earScope: input.earScope,
        onset: input.onset,
        source: "PHYSICIAN_CONFIRMED",
        details: input.details,
        status: "ACTIVE",
        statusReason: "",
      },
    });
    revalidatePath(`/hospital-patients/${patientId}`);
    revalidatePath(`/employees/${input.employeeId}`);
    redirect(`/hospital-patients/${patientId}?historySaved=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message.slice(0, 500) : "ไม่สามารถบันทึกประวัติได้";
    redirect(`/hospital-patients/${patientId}?error=${encodeURIComponent(message)}`);
  }
}
