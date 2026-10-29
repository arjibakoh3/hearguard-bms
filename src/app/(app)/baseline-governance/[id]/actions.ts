"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getHearGuardBaselineGovernanceService } from "@/lib/server/hearguard-baseline-governance-service";
import { requireBaselineReviewer } from "@/lib/server/current-actor";

const ReviewSchema = z.object({
  suggestionId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT", "DEFER"]),
  reviewNote: z.string().trim().min(8).max(2000),
});

export async function reviewBaselineSuggestion(formData: FormData) {
  await requireBaselineReviewer();
  const parsed = ReviewSchema.parse({
    suggestionId: formData.get("suggestionId"),
    decision: formData.get("decision"),
    reviewNote: formData.get("reviewNote"),
  });

  await getHearGuardBaselineGovernanceService().reviewSuggestion(
    parsed.suggestionId,
    parsed.decision,
    parsed.reviewNote,
  );
  revalidatePath("/baseline-governance");
  revalidatePath(`/baseline-governance/${parsed.suggestionId}`);
  revalidatePath("/audit");
  redirect(`/baseline-governance/${parsed.suggestionId}?reviewed=1`);
}
