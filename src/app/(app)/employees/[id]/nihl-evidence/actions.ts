"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  NihlPhysicianReviewInputSchema,
  NoiseExposurePeriodInputSchema,
  NihlReviewAmendmentInputSchema,
  NihlReviewConflictError,
  type NihlReviewAmendmentState,
} from "@/application/nihl-evidence-models";
import {
  requireBaselineReviewer,
  requireHospitalClinicalActor,
  requireManagingActor,
} from "@/lib/server/current-actor";
import { getHearGuardNihlEvidenceService } from "@/lib/server/hearguard-nihl-evidence-service";

const optionalNumber = (formData: FormData, name: string) => {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} ต้องเป็นตัวเลข`);
  return parsed;
};

const optionalDate = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" && value ? value : null;
};

function errorText(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join(" · ").slice(0, 600);
  return error instanceof Error ? error.message.slice(0, 600) : "เกิดข้อผิดพลาด";
}

export async function saveNoiseExposurePeriod(formData: FormData) {
  await requireManagingActor();
  const employeeId = z.string().uuid().parse(formData.get("employeeId"));
  let destination = `/employees/${employeeId}/nihl-evidence`;
  try {
    const metric = z.enum(["LEX_8H", "LAEQ_TE", "DAILY_DOSE"]).parse(formData.get("metric"));
    const protectionType = String(formData.get("protectionType") ?? "").trim();
    const input = NoiseExposurePeriodInputSchema.parse({
      id: null,
      employeeId,
      employerName: String(formData.get("employerName") ?? ""),
      jobTitle: String(formData.get("jobTitle") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: optionalDate(formData, "endDate"),
      hoursPerDay: optionalNumber(formData, "hoursPerDay"),
      daysPerWeek: optionalNumber(formData, "daysPerWeek"),
      weeksPerYear: optionalNumber(formData, "weeksPerYear"),
      exposurePattern: formData.get("exposurePattern"),
      impulseNoise: formData.get("impulseNoise") === "on",
      informationSource: formData.get("informationSource"),
      confidence: formData.get("confidence"),
      notes: String(formData.get("notes") ?? ""),
      status: "ACTIVE",
      statusReason: "",
      sources: [{
        noiseExposureId: null,
        measurementKind: formData.get("measurementKind"),
        metric,
        levelDbA: metric === "DAILY_DOSE" ? null : optionalNumber(formData, "levelDbA"),
        dosePercent: metric === "DAILY_DOSE" ? optionalNumber(formData, "dosePercent") : null,
        measurementDurationHours: metric === "LAEQ_TE" ? optionalNumber(formData, "measurementDurationHours") : metric === "LEX_8H" ? 8 : null,
        exchangeRateDb: metric === "DAILY_DOSE" ? optionalNumber(formData, "exchangeRateDb") : null,
        criterionLevelDbA: metric === "DAILY_DOSE" ? optionalNumber(formData, "criterionLevelDbA") : null,
        measurementDate: optionalDate(formData, "measurementDate"),
        representativeFrom: null,
        representativeTo: null,
        quality: formData.get("confidence"),
        notes: String(formData.get("sourceNotes") ?? ""),
        verified: formData.get("verified") === "on",
      }],
      hearingProtection: protectionType ? [{
        startDate: null,
        endDate: null,
        protectionType,
        wearingTimePercent: optionalNumber(formData, "wearingTimePercent"),
        attenuationMethod: formData.get("attenuationMethod"),
        attenuationDb: optionalNumber(formData, "attenuationDb"),
        fitTestDate: optionalDate(formData, "fitTestDate"),
        notes: String(formData.get("protectionNotes") ?? ""),
      }] : [],
    });
    await getHearGuardNihlEvidenceService().saveExposurePeriod(input);
    revalidatePath(destination);
    revalidatePath(`/employees/${employeeId}`);
    destination += "?saved=exposure";
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function refreshNihlEvidence(formData: FormData) {
  await requireHospitalClinicalActor();
  const employeeId = z.string().uuid().parse(formData.get("employeeId"));
  const audiogramId = z.string().uuid().nullable().parse(formData.get("audiogramId") || null);
  let destination = `/employees/${employeeId}/nihl-evidence`;
  try {
    await getHearGuardNihlEvidenceService().refreshForEmployee(employeeId, audiogramId);
    revalidatePath(destination);
    destination += "?saved=assessment";
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function reviewNihlEvidence(formData: FormData) {
  await requireBaselineReviewer();
  const input = NihlPhysicianReviewInputSchema.parse({
    assessmentId: formData.get("assessmentId"),
    employeeId: formData.get("employeeId"),
    decision: formData.get("decision"),
    reviewNote: formData.get("reviewNote"),
  });
  let destination = `/employees/${input.employeeId}/nihl-evidence`;
  try {
    await getHearGuardNihlEvidenceService().reviewAssessment(input);
    revalidatePath(destination);
    destination += "?saved=review";
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function amendNihlReview(_state: NihlReviewAmendmentState, formData: FormData): Promise<NihlReviewAmendmentState> {
  await requireBaselineReviewer();
  try {
    const input = NihlReviewAmendmentInputSchema.parse({
      reviewId: formData.get("reviewId"), employeeId: formData.get("employeeId"),
      expectedRevision: Number(formData.get("expectedRevision")),
      decision: formData.get("decision"), reviewNote: formData.get("reviewNote"),
    });
    const result = await getHearGuardNihlEvidenceService().amendReview(input);
    const employeePath = `/employees/${input.employeeId}`;
    revalidatePath(`${employeePath}/nihl-evidence`);
    revalidatePath(employeePath);
    revalidatePath(`${employeePath}/reports/audiograms/${result.audiogramId}`);
    revalidatePath(`/paperless-audiometry/${result.audiogramId}`);
    return { error: null, conflict: false, saved: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: "กรุณาเลือกข้อสรุปและระบุเหตุผลของแพทย์ 1–4,000 ตัวอักษร", conflict: false };
    return { error: errorText(error), conflict: error instanceof NihlReviewConflictError };
  }
}
