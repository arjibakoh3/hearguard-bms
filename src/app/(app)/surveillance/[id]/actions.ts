"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getHearGuardFollowUpService } from "@/lib/server/hearguard-follow-up-service";
import { getHearGuardReadService } from "@/lib/server/hearguard-read-service";
import { requireManagingActor } from "@/lib/server/current-actor";

const AdvanceCaseSchema = z.object({
  caseId: z.string().uuid(),
  newStatus: z.enum([
    "SHIFT_DETECTED",
    "REPEAT_REQUIRED",
    "REPEAT_COMPLETED",
    "PHYSICIAN_REVIEW",
    "INTERVENTION_REQUIRED",
    "FOLLOW_UP",
    "CLOSED",
  ]),
});

export async function advanceFollowUpCase(formData: FormData) {
  await requireManagingActor();
  const parsed = AdvanceCaseSchema.parse({
    caseId: formData.get("caseId"),
    newStatus: formData.get("newStatus"),
  });
  const caseDetail = await getHearGuardReadService().getFollowUpCase(parsed.caseId);
  if (!caseDetail) throw new Error("Follow-up case not found");

  await getHearGuardFollowUpService().advanceStatus(
    parsed.caseId,
    caseDetail.status,
    parsed.newStatus,
  );

  revalidatePath("/surveillance");
  revalidatePath(`/surveillance/${parsed.caseId}`);
  revalidatePath(`/employees/${caseDetail.employeeId}`);
  redirect(`/surveillance/${parsed.caseId}?updated=1`);
}
