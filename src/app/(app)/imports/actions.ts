"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CREATABLE_IMPORT_EXAM_TYPES } from "@/application/import-view-models";
import {
  CSV_IMPORT_FIELDS,
  type CsvColumnMapping,
} from "@/domain/imports/csv-audiometry-import";
import { getHearGuardImportService } from "@/lib/server/hearguard-import-service";
import { getBeerthipImportService } from "@/application/beerthip-import-service";
import { beerthipReviewNoteSchema } from "@/domain/imports/beerthip-review-note";
import { requireBaselineReviewer, requireManagingActor } from "@/lib/server/current-actor";

const UploadSchema = z.object({
  organizationId: z.string().uuid(),
  examType: z.enum(CREATABLE_IMPORT_EXAM_TYPES),
});

const BatchSchema = z.object({ batchId: z.string().uuid() });

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

export async function uploadCsvBatch(formData: FormData) {
  await requireManagingActor();
  let destination = "/imports";
  try {
    const input = UploadSchema.parse({
      organizationId: formData.get("organizationId"),
      examType: formData.get("examType"),
    });
    const file = formData.get("csvFile");
    if (!(file instanceof File) || file.size === 0) throw new Error("กรุณาเลือกไฟล์ CSV");
    if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("รองรับเฉพาะไฟล์ .csv ใน Phase 6");
    if (file.size > 750_000) throw new Error("ไฟล์ CSV ต้องมีขนาดไม่เกิน 750 KB");

    const batchId = await getHearGuardImportService().createBatch({
      ...input,
      filename: file.name.replace(/[\u0000-\u001f/\\]/g, "_").slice(0, 180),
      csvText: await file.text(),
    });
    destination = `/imports/${batchId}/map`;
  } catch (error) {
    destination = `/imports?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function validateCsvBatch(formData: FormData) {
  await requireManagingActor();
  let destination = "/imports";
  let batchId = "";
  try {
    batchId = BatchSchema.parse({ batchId: formData.get("batchId") }).batchId;
    const mapping: CsvColumnMapping = {};
    for (const field of CSV_IMPORT_FIELDS) {
      const value = formData.get(`mapping.${field.key}`);
      if (typeof value === "string" && value) mapping[field.key] = value;
    }
    await getHearGuardImportService().validateBatch(batchId, mapping);
    destination = `/imports/${batchId}/validate`;
  } catch (error) {
    destination = batchId
      ? `/imports/${batchId}/map?error=${encodeURIComponent(errorText(error))}`
      : `/imports?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function commitCsvBatch(formData: FormData) {
  await requireManagingActor();
  let destination = "/imports";
  let batchId = "";
  try {
    batchId = BatchSchema.parse({ batchId: formData.get("batchId") }).batchId;
    const result = await getHearGuardImportService().commitBatch(batchId);
    if (!result.success) {
      destination = `/imports/${batchId}?error=${encodeURIComponent(result.error ?? "นำเข้าไม่สำเร็จ")}`;
    } else {
      revalidatePath("/workspace");
      revalidatePath("/companies");
      revalidatePath("/employees");
      revalidatePath("/audiograms");
      revalidatePath("/surveillance");
      revalidatePath("/imports");
      destination = `/imports/${batchId}?completed=1`;
    }
  } catch (error) {
    destination = batchId
      ? `/imports/${batchId}?error=${encodeURIComponent(errorText(error))}`
      : `/imports?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function uploadBeerthipFiles(formData: FormData) {
  await requireManagingActor();
  let destination = "/imports";
  let batchId = "";
  try {
    const files = formData.getAll("audioFiles");
    if (files.some((file) => !(file instanceof File))) throw new Error("กรุณาเลือกไฟล์ XLSX");
    batchId = await getBeerthipImportService().stage(files as File[]);
    await getBeerthipImportService().attachOriginals(batchId, files as File[]);
    revalidatePath("/imports");
    destination = `/imports/beerthip/${batchId}`;
  } catch (error) {
    destination = batchId
      ? `/imports/beerthip/${batchId}?error=${encodeURIComponent(errorText(error))}`
      : `/imports?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function attachBeerthipOriginals(formData: FormData) {
  await requireManagingActor();
  const batchId = BatchSchema.parse({ batchId: formData.get("batchId") }).batchId;
  let destination = `/imports/beerthip/${batchId}`;
  try {
    const files = formData.getAll("audioFiles");
    if (files.length < 1 || files.length > 50 || files.some((file) => !(file instanceof File))
      || files.reduce((total, file) => total + (file instanceof File ? file.size : 0), 0) > 5_000_000) {
      throw new Error("เลือก XLSX 1–50 ไฟล์ ขนาดรวมไม่เกิน 5 MB");
    }
    await getBeerthipImportService().attachOriginals(batchId, files as File[]);
    revalidatePath(destination);
    destination += "?updated=sources";
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}

export async function reviewBeerthipFile(formData: FormData) {
  await requireBaselineReviewer();
  const batchId = BatchSchema.parse({ batchId: formData.get("batchId") }).batchId;
  let destination = `/imports/beerthip/${batchId}`;
  try {
    const fileId = z.uuid().parse(formData.get("fileId"));
    const decision = z.enum(["APPROVE", "REJECT", "DEFER"]).parse(formData.get("decision"));
    const note = beerthipReviewNoteSchema.parse(formData.get("reviewNote"));
    const acknowledge = formData.get("acknowledgeWarnings") === "on";
    const client = await (await import("@/infrastructure/supabase/server-client")).createSupabaseServerClient();
    const file = await client.from("beerthip_import_files").select("batch_id").eq("id", fileId).single();
    if (file.error || file.data?.batch_id !== batchId) throw new Error("ไฟล์ไม่ตรงกับ batch");
    const result = await client.rpc("review_beerthip_import_file", {
      p_file_id: fileId, p_decision: decision, p_review_note: note,
      p_acknowledge_warnings: acknowledge,
    });
    if (result.error) throw new Error(result.error.message);
    revalidatePath(destination);
    revalidatePath("/imports");
    revalidatePath("/workspace");
    revalidatePath("/employees");
    revalidatePath("/audiograms");
    revalidatePath("/surveillance");
    destination += `?updated=${decision.toLowerCase()}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(errorText(error))}`;
  }
  redirect(destination);
}
