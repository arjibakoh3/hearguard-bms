import "server-only";

import type { PostgresClient } from "@/infrastructure/postgres/server-client";
import { z } from "zod";
import { NihlPhysicianReviewInputSchema } from "@/application/nihl-evidence-models";
import type { ReportNihlReview } from "@/application/view-models";

const ReportAssessmentRow = z.object({
  patient_id: z.string().uuid().nullable(),
  nihl_physician_reviews: z.object({
    decision: NihlPhysicianReviewInputSchema.shape.decision,
    review_note: z.string(),
    reviewed_at: z.string(),
    amended_at: z.string().nullable(),
  }).nullable(),
});

export async function loadReportNihlReview(
  client: PostgresClient,
  employeeId: string,
  audiogramId: string,
): Promise<ReportNihlReview | null> {
  // Use the caller's RLS-scoped client and exact report target. The NIHL
  // workspace can fall back to another audiogram, which is unsuitable here.
  const response = await client.from("nihl_evidence_assessments")
    .select("patient_id,nihl_physician_reviews(decision,review_note,reviewed_at,amended_at)")
    .eq("employee_id", employeeId)
    .eq("current_audiogram_id", audiogramId)
    .eq("record_status", "CURRENT")
    .maybeSingle();
  if (response.error) throw new Error(`Unable to load report NIHL review: ${response.error.message}`);
  if (!response.data) return null;
  const row = ReportAssessmentRow.parse(response.data);
  const review = row.nihl_physician_reviews;
  if (!review) return null;
  return {
    decision: review.decision,
    reviewNote: review.review_note,
    reviewedAt: review.reviewed_at,
    amendedAt: review.amended_at,
    // Scope belongs to the saved assessment, even if the employee links to an HN later.
    identityScope: row.patient_id ? "HN_LINKED" : "EMPLOYEE_ONLY",
  };
}
