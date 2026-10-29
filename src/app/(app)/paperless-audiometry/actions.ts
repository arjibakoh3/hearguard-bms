"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  PAPERLESS_EXAM_TYPES,
  PaperlessAudiogramInputSchema,
  type HospitalPatientEmploymentSummary,
  type ImportantHearingHistoryState,
  type PriorHistorySnapshot,
} from "@/application/paperless-audiometry-models";
import { requireHospitalAdmin, requireHospitalClinicalActor, requireManagingActor } from "@/lib/server/current-actor";
import { getHearGuardPaperlessAudiometryService } from "@/lib/server/hearguard-paperless-audiometry-service";

export type PaperlessActionState = { error: string | null };

const NewEmployeeSchema = z.object({
  hospitalNumber: z.string(),
  departmentId: z.string().uuid().nullable(),
  employeeNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  sex: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  jobTitle: z.string().nullable(),
  employmentStartDate: z.string().nullable(),
  transitionMode: z.enum(["TRANSFER", "CONCURRENT"]).nullable(),
  effectiveDate: z.string().nullable(),
  priorEmployeeId: z.string().uuid().nullable(),
});

const SubmissionSchema = z.object({
  draftId: z.string().uuid().nullable(),
  input: PaperlessAudiogramInputSchema.extend({ employeeId: z.string() }),
  newEmployee: NewEmployeeSchema.nullable(),
});

const PriorHistoryRequestSchema = z.object({
  employeeId: z.string().uuid(),
  examType: z.enum(PAPERLESS_EXAM_TYPES),
  sourceMonitoringAudiogramId: z.string().uuid().nullable(),
  examinedAt: z.iso.datetime(),
});

function errorText(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(" · ").slice(0, 800);
  }
  return error instanceof Error ? error.message.slice(0, 800) : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

function revalidatePaperless(): void {
  revalidatePath("/workspace");
  revalidatePath("/employees");
  revalidatePath("/audiograms");
  revalidatePath("/surveillance");
  revalidatePath("/baseline-governance");
  revalidatePath("/paperless-audiometry");
}

export async function savePaperlessAudiogram(
  _previous: PaperlessActionState,
  formData: FormData,
): Promise<PaperlessActionState> {
  await requireManagingActor();
  try {
    const serialized = formData.get("payload");
    if (typeof serialized !== "string") throw new Error("ไม่พบข้อมูลแบบฟอร์ม");
    const parsed = SubmissionSchema.parse(JSON.parse(serialized));
    const service = getHearGuardPaperlessAudiometryService();
    const employeeId = parsed.newEmployee
      ? await service.registerEmployee({
          ...parsed.newEmployee,
          organizationId: parsed.input.organizationId,
        })
      : parsed.input.employeeId;
    const input = PaperlessAudiogramInputSchema.parse({
      ...parsed.input,
      employeeId,
    });
    const intent = formData.get("intent") === "finalize" ? "finalize" : "save";
    if (intent === "finalize") {
      const result = await service.saveAndFinalize(parsed.draftId, input);
      revalidatePaperless();
      redirect(`/paperless-audiometry/${result.audiogramId}?finalized=1&suggestions=${result.suggestionsCreated}&nihl=${result.nihlAssessmentCreated ? 1 : 0}`);
    }
    const draftId = await service.saveDraft(parsed.draftId, input);
    revalidatePaperless();
    redirect(`/paperless-audiometry/${draftId}/edit?saved=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: errorText(error) };
  }
}

export async function lookupHospitalPatientEmployments(
  hospitalNumber: string,
): Promise<HospitalPatientEmploymentSummary | null> {
  await requireManagingActor();
  return getHearGuardPaperlessAudiometryService().lookupPatientEmployments(hospitalNumber);
}

export async function loadPriorHistorySnapshot(
  rawInput: z.input<typeof PriorHistoryRequestSchema>,
): Promise<PriorHistorySnapshot | null> {
  await requireManagingActor();
  const input = PriorHistoryRequestSchema.parse(rawInput);
  return getHearGuardPaperlessAudiometryService().getPriorHistorySnapshot(input);
}

export async function loadImportantHearingHistory(
  employeeId: string,
): Promise<ImportantHearingHistoryState | null> {
  await requireHospitalClinicalActor();
  return getHearGuardPaperlessAudiometryService()
    .getImportantHearingHistory(z.string().uuid().parse(employeeId));
}

export async function createPaperlessCorrection(formData: FormData) {
  await requireManagingActor();
  const sourceId = z.string().uuid().parse(formData.get("sourceId"));
  try {
    const draftId = await getHearGuardPaperlessAudiometryService().createCorrection(sourceId);
    revalidatePath("/paperless-audiometry");
    redirect(`/paperless-audiometry/${draftId}/edit?correction=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/paperless-audiometry/${sourceId}?error=${encodeURIComponent(errorText(error))}`);
  }
}

export async function proposePaperlessInitialBaseline(formData: FormData) {
  await requireManagingActor();
  const audiogramId = z.string().uuid().parse(formData.get("audiogramId"));
  try {
    const suggestionId = await getHearGuardPaperlessAudiometryService()
      .proposeInitialBaseline(audiogramId);
    revalidatePath("/baseline-governance");
    redirect(`/baseline-governance/${suggestionId}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`/paperless-audiometry/${audiogramId}?error=${encodeURIComponent(errorText(error))}`);
  }
}

export async function upsertHospitalAudiometer(formData: FormData) {
  await requireHospitalAdmin();
  let destination = "/paperless-audiometry/equipment";
  try {
    await getHearGuardPaperlessAudiometryService().upsertAudiometer({
      id: z.string().uuid().nullable().parse(formData.get("id") || null),
      displayName: z.string().parse(formData.get("displayName")),
      model: z.string().parse(formData.get("model")),
      serialNumber: z.string().parse(formData.get("serialNumber")),
      location: z.string().parse(formData.get("location")),
      calibrationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().parse(formData.get("calibrationDate") || null),
      active: formData.get("active") === "on",
    });
    revalidatePath("/paperless-audiometry");
    revalidatePath("/paperless-audiometry/equipment");
    destination += "?saved=1";
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}
