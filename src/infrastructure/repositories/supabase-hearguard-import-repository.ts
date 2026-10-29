import "server-only";

import { z } from "zod";
import type {
  CommitImportResult,
  ImportBaselineContext,
  ImportBatchListItem,
  ImportBatchRow,
  ImportValidationContext,
} from "@/application/import-view-models";
import type { HearGuardImportRepository } from "@/application/ports/hearguard-import-repository";
import type { Audiogram } from "@/domain/hearing/types/audiogram";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

const ImportBatchStatusSchema = z.enum([
  "UPLOADED",
  "VALIDATING",
  "READY",
  "IMPORTING",
  "COMPLETED",
  "FAILED",
  "ROLLED_BACK",
]);

const ExamTypeSchema = z.enum(["ANNUAL", "REPEAT", "CONFIRMATION", "OTHER"]);

const BatchRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  organization_code: z.string(),
  organization_name: z.string(),
  organization_name_th: z.string().nullable(),
  filename: z.string(),
  uploaded_at: z.string(),
  status: ImportBatchStatusSchema,
  exam_type: ExamTypeSchema,
  rows_total: z.number().int().nonnegative(),
  rows_success: z.number().int().nonnegative(),
  rows_warning: z.number().int().nonnegative(),
  rows_failed: z.number().int().nonnegative(),
  source_headers_json: z.array(z.string()),
  column_mapping_json: z.record(z.string(), z.string()),
  existing_employees_matched: z.number().int().nonnegative(),
  new_employees_created: z.number().int().nonnegative(),
  audiograms_imported: z.number().int().nonnegative(),
  threshold_shifts_detected: z.number().int().nonnegative(),
  follow_up_cases_created: z.number().int().nonnegative(),
  completed_at: z.string().nullable(),
  error_message: z.string().nullable(),
});

const ValidationMessageSchema = z.object({
  code: z.string(),
  severity: z.enum(["WARNING", "ERROR"]),
  message: z.string(),
  field: z.string().optional(),
});

const StagedRowSchema = z.object({
  id: z.string().uuid(),
  import_batch_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  row_number: z.number().int(),
  source_data_json: z.record(z.string(), z.string()),
  normalized_data_json: z.record(z.string(), z.unknown()).nullable(),
  classification: z.enum(["READY", "WARNING", "ERROR"]).nullable(),
  messages_json: z.array(ValidationMessageSchema),
  matched_employee_id: z.string().uuid().nullable(),
});

const DepartmentRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});

const EmployeeRowSchema = z.object({
  id: z.string().uuid(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  department_id: z.string().uuid().nullable(),
});

const AudiogramKeyRowSchema = z.object({
  employee_id: z.string().uuid(),
  exam_date: z.string(),
  exam_type: z.string(),
});

const BaselineHistoryRowSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  baseline_audiogram_id: z.string().uuid(),
});

const ThresholdRowSchema = z.object({
  ear: z.enum(["LEFT", "RIGHT"]),
  frequency_hz: z.union([
    z.literal(500), z.literal(1000), z.literal(2000), z.literal(3000),
    z.literal(4000), z.literal(6000), z.literal(8000),
  ]),
  threshold_db_hl: z.union([z.number(), z.string().transform(Number)]),
});

const BaselineAudiogramRowSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  exam_date: z.string(),
  exam_type: z.enum(["BASELINE", "ANNUAL", "REPEAT", "CONFIRMATION", "OTHER"]),
  is_valid: z.boolean(),
  validation_notes: z.string().nullable(),
  audiogram_thresholds: z.array(ThresholdRowSchema),
});

const CommitResultSchema = z.object({
  success: z.boolean(),
  batchId: z.string().uuid(),
  rowsImported: z.number().int().nonnegative().optional(),
  existingEmployeesMatched: z.number().int().nonnegative().optional(),
  newEmployeesCreated: z.number().int().nonnegative().optional(),
  thresholdShiftsDetected: z.number().int().nonnegative().optional(),
  followUpCasesCreated: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

function toBatch(row: z.infer<typeof BatchRowSchema>): ImportBatchListItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationCode: row.organization_code,
    organizationName: row.organization_name,
    organizationNameTh: row.organization_name_th,
    filename: row.filename,
    uploadedAt: row.uploaded_at,
    status: row.status,
    examType: row.exam_type,
    rowsTotal: row.rows_total,
    rowsSuccess: row.rows_success,
    rowsWarning: row.rows_warning,
    rowsFailed: row.rows_failed,
    headers: row.source_headers_json,
    columnMapping: row.column_mapping_json,
    existingEmployeesMatched: row.existing_employees_matched,
    newEmployeesCreated: row.new_employees_created,
    audiogramsImported: row.audiograms_imported,
    thresholdShiftsDetected: row.threshold_shifts_detected,
    followUpCasesCreated: row.follow_up_cases_created,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  };
}

function toBatchRow(row: z.infer<typeof StagedRowSchema>): ImportBatchRow {
  return {
    id: row.id,
    batchId: row.import_batch_id,
    organizationId: row.organization_id,
    rowNumber: row.row_number,
    source: row.source_data_json,
    normalized: row.normalized_data_json,
    classification: row.classification,
    messages: row.messages_json,
    matchedEmployeeId: row.matched_employee_id,
  };
}

function toAudiogram(row: z.infer<typeof BaselineAudiogramRowSchema>): Audiogram {
  return {
    id: row.id,
    employeeId: row.employee_id,
    examDate: row.exam_date,
    examType: row.exam_type,
    isValid: row.is_valid,
    validationNotes: row.validation_notes ?? undefined,
    thresholds: row.audiogram_thresholds.map((threshold) => ({
      ear: threshold.ear,
      frequencyHz: threshold.frequency_hz,
      thresholdDbHl: threshold.threshold_db_hl,
    })),
  };
}

export class SupabaseHearGuardImportRepository implements HearGuardImportRepository {
  async createBatch(input: Parameters<HearGuardImportRepository["createBatch"]>[0]): Promise<string> {
    const client = await createSupabaseServerClient();
    const batchResponse = await client
      .from("import_batches")
      .insert({
        organization_id: input.organizationId,
        filename: input.filename,
        status: "UPLOADED",
        exam_type: input.examType,
        rows_total: input.rows.length,
        source_headers_json: input.headers,
      })
      .select("id")
      .single();
    if (batchResponse.error || !batchResponse.data) {
      throw new Error(`สร้าง import batch ไม่สำเร็จ: ${batchResponse.error?.message ?? "ไม่พบ batch"}`);
    }

    const batchId = z.string().uuid().parse(batchResponse.data.id);
    const stagedRows = input.rows.map((row) => ({
      import_batch_id: batchId,
      organization_id: input.organizationId,
      row_number: row.rowNumber,
      source_data_json: row.values,
    }));

    for (let start = 0; start < stagedRows.length; start += 500) {
      const response = await client.from("import_batch_rows").insert(stagedRows.slice(start, start + 500));
      if (response.error) {
        await client.from("import_batches").delete().eq("id", batchId);
        throw new Error(`จัดเก็บแถว CSV ไม่สำเร็จ: ${response.error.message}`);
      }
    }

    return batchId;
  }

  async listBatches(): Promise<ImportBatchListItem[]> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("import_batch_directory")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(50);
    if (response.error) throw new Error(`อ่านประวัติ import ไม่สำเร็จ: ${response.error.message}`);
    return z.array(BatchRowSchema).parse(response.data ?? []).map(toBatch);
  }

  async getBatch(id: string): Promise<ImportBatchListItem | null> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("import_batch_directory")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (response.error) throw new Error(`อ่าน import batch ไม่สำเร็จ: ${response.error.message}`);
    return response.data ? toBatch(BatchRowSchema.parse(response.data)) : null;
  }

  async listBatchRows(id: string): Promise<ImportBatchRow[]> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("import_batch_rows")
      .select("id, import_batch_id, organization_id, row_number, source_data_json, normalized_data_json, classification, messages_json, matched_employee_id")
      .eq("import_batch_id", id)
      .order("row_number");
    if (response.error) throw new Error(`อ่านแถว import ไม่สำเร็จ: ${response.error.message}`);
    return z.array(StagedRowSchema).parse(response.data ?? []).map(toBatchRow);
  }

  async getValidationContext(organizationId: string): Promise<ImportValidationContext> {
    const client = await createSupabaseServerClient();
    const [departmentResponse, employeeResponse, audiogramResponse, baselineResponse] = await Promise.all([
      client.from("departments").select("id, code, name").eq("organization_id", organizationId).eq("active", true),
      client.from("employees").select("id, employee_number, first_name, last_name, department_id").eq("organization_id", organizationId),
      client.from("audiograms").select("employee_id, exam_date, exam_type").eq("organization_id", organizationId),
      client.from("hearing_baseline_history").select("id, employee_id, baseline_audiogram_id")
        .eq("organization_id", organizationId)
        .eq("status", "ACTIVE")
        .eq("framework_or_context", "THAI_OPERATIONAL")
        .eq("ear_scope", "BOTH"),
    ]);
    const firstError = [departmentResponse, employeeResponse, audiogramResponse, baselineResponse]
      .find((response) => response.error)?.error;
    if (firstError) throw new Error(`เตรียมข้อมูล validation ไม่สำเร็จ: ${firstError.message}`);

    const departments = z.array(DepartmentRowSchema).parse(departmentResponse.data ?? []);
    const employees = z.array(EmployeeRowSchema).parse(employeeResponse.data ?? []);
    const audiograms = z.array(AudiogramKeyRowSchema).parse(audiogramResponse.data ?? []);
    const baselineHistories = z.array(BaselineHistoryRowSchema).parse(baselineResponse.data ?? []);
    let baselines: ImportBaselineContext[] = [];

    if (baselineHistories.length > 0) {
      const baselineAudiogramResponse = await client
        .from("audiograms")
        .select("id, employee_id, exam_date, exam_type, is_valid, validation_notes, audiogram_thresholds(ear, frequency_hz, threshold_db_hl)")
        .in("id", baselineHistories.map((baseline) => baseline.baseline_audiogram_id));
      if (baselineAudiogramResponse.error) {
        throw new Error(`อ่าน operational baseline ไม่สำเร็จ: ${baselineAudiogramResponse.error.message}`);
      }
      const audiogramById = new Map(
        z.array(BaselineAudiogramRowSchema).parse(baselineAudiogramResponse.data ?? [])
          .map((row) => [row.id, toAudiogram(row)]),
      );
      baselines = baselineHistories.flatMap((history) => {
        const audiogram = audiogramById.get(history.baseline_audiogram_id);
        return audiogram ? [{ historyId: history.id, employeeId: history.employee_id, audiogram }] : [];
      });
    }

    return {
      departments: departments.map((department) => ({
        id: department.id,
        code: department.code,
        name: department.name,
      })),
      employees: employees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employee_number,
        firstName: employee.first_name,
        lastName: employee.last_name,
        departmentId: employee.department_id,
      })),
      existingAudiogramKeys: audiograms.map((audiogram) =>
        `${audiogram.employee_id}|${audiogram.exam_date}|${audiogram.exam_type}`),
      baselines,
    };
  }

  async saveValidation(input: Parameters<HearGuardImportRepository["saveValidation"]>[0]): Promise<void> {
    const client = await createSupabaseServerClient();
    const response = await client.rpc("save_import_batch_validation", {
      target_batch_id: input.batchId,
      mapping_json: input.mapping,
      validated_rows_json: input.rows,
    });
    if (response.error) throw new Error(`บันทึกผล validation ไม่สำเร็จ: ${response.error.message}`);
  }

  async commitBatch(id: string): Promise<CommitImportResult> {
    const client = await createSupabaseServerClient();
    const response = await client.rpc("commit_import_batch", { target_batch_id: id });
    if (response.error) throw new Error(`ยืนยันการนำเข้าไม่สำเร็จ: ${response.error.message}`);
    return CommitResultSchema.parse(response.data);
  }
}
