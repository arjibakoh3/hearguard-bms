import "server-only";

import { createHash } from "node:crypto";
import { parseBeerthipAudioXlsx, type BeerthipAudioRow } from "@/domain/imports/beerthip-audio-xlsx";
import { evaluateThaiHearingRule } from "@/domain/hearing/rules/thai-hearing-2561";
import { evaluateOshaSts } from "@/domain/hearing/rules/osha-sts";
import { measuredThresholdsFromObservations, type Audiogram } from "@/domain/hearing/types/audiogram";
import type { ImportValidationMessage } from "@/domain/imports/csv-audiometry-import";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/admin-client";
import { getCurrentActor } from "@/lib/server/current-actor";

export const BEERTHIP_ORGANIZATION_CODE = "BEERTHIP_1991";

export type BeerthipStagedRow = {
  ordinal: number;
  data: BeerthipAudioRow;
  classification: "READY" | "WARNING" | "ERROR";
  messages: ImportValidationMessage[];
};

export type BeerthipBatch = {
  id: string;
  status: "STAGED" | "PARTIALLY_IMPORTED" | "COMPLETED";
  uploaded_at: string;
  file_count: number;
  row_count: number;
  ready_count: number;
  warning_count: number;
  error_count: number;
  source_files_json: Array<{ name: string; sha256: string }>;
  department_proposals_json: Array<{ name: string; code: string; existing: boolean }>;
  organization_id: string;
};

export type BeerthipStoredFile = {
  id: string;
  batch_id: string;
  organization_id: string;
  source_filename: string;
  expected_sha256: string;
  storage_path: string;
  source_status: "PENDING" | "VERIFIED" | "FAILED";
  review_status: "PENDING" | "DEFERRED" | "REJECTED" | "IMPORTED";
  reviewed_at: string | null;
  review_note: string | null;
  verified_at: string | null;
};

export type BeerthipStoredRow = {
  id: string;
  audiogram_id: string | null;
  ordinal: number;
  employee_number: string;
  source_filename: string;
  source_row: number;
  exam_date: string;
  exam_type: "BASELINE" | "ANNUAL" | "CONFIRMATION";
  classification: "READY" | "WARNING" | "ERROR";
  messages_json: ImportValidationMessage[];
  staged_data_json: BeerthipAudioRow;
};

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

function message(code: string, severity: "WARNING" | "ERROR", description: string): ImportValidationMessage {
  return { code, severity, message: description };
}

export class BeerthipImportService {
  async attachOriginals(batchId: string, uploads: readonly File[]): Promise<void> {
    const actor = await getCurrentActor();
    const client = await createSupabaseServerClient();
    const batchResponse = await client.from("beerthip_import_batches")
      .select("id,organization_id,status").eq("id", batchId).single();
    if (batchResponse.error || !batchResponse.data) throw new Error("ไม่พบ batch ที่แนบต้นฉบับ");
    const batch = batchResponse.data;
    if (!actor || !(actor.role === "HOSPITAL_ADMIN" ||
      (actor.role === "OCCUPATIONAL_HEALTH_STAFF" && actor.organizationIds.includes(batch.organization_id)))) {
      throw new Error("บัญชีนี้ไม่มีสิทธิ์แนบไฟล์ต้นฉบับขององค์กร");
    }
    if (batch.status === "COMPLETED") throw new Error("batch นี้นำเข้าแล้ว");
    const fileResponse = await client.from("beerthip_import_files").select("*").eq("batch_id", batchId);
    if (fileResponse.error) throw new Error(fileResponse.error.message);
    const expected = new Map((fileResponse.data as BeerthipStoredFile[]).map((file) => [file.source_filename, file]));
    const seen = new Set<string>();
    const admin = createSupabaseAdminClient();
    for (const upload of uploads) {
      if (!(upload instanceof File) || !upload.name.toLowerCase().endsWith(".xlsx") || upload.size > 1_000_000) {
        throw new Error("รองรับ .xlsx ไม่เกิน 1 MB ต่อไฟล์");
      }
      const safeName = upload.name.replace(/[\u0000-\u001f/\\]/g, "_");
      if (seen.has(safeName)) throw new Error(`ชื่อไฟล์ซ้ำ: ${safeName}`);
      seen.add(safeName);
      const file = expected.get(safeName);
      if (!file) throw new Error(`ไฟล์ ${safeName} ไม่อยู่ใน manifest ของ batch นี้`);
      const bytes = new Uint8Array(await upload.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== file.expected_sha256) {
        await admin.from("beerthip_import_files").update({ source_status: "FAILED", verified_sha256: null,
          verified_at: null }).eq("id", file.id).neq("review_status", "IMPORTED");
        throw new Error(`SHA-256 ของ ${safeName} ไม่ตรงกับไฟล์ที่ staging`);
      }
      if (file.review_status === "IMPORTED") continue;
      const uploaded = await admin.storage.from("beerthip-source-xlsx").upload(file.storage_path, bytes, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true,
      });
      if (uploaded.error) throw new Error(`จัดเก็บ ${safeName} ไม่สำเร็จ: ${uploaded.error.message}`);
      const downloaded = await admin.storage.from("beerthip-source-xlsx").download(file.storage_path);
      if (downloaded.error || !downloaded.data) throw new Error(`ตรวจไฟล์ ${safeName} หลังจัดเก็บไม่สำเร็จ`);
      const storedHash = createHash("sha256").update(new Uint8Array(await downloaded.data.arrayBuffer())).digest("hex");
      if (storedHash !== file.expected_sha256) {
        await admin.from("beerthip_import_files").update({ source_status: "FAILED", verified_sha256: null,
          verified_at: null }).eq("id", file.id);
        throw new Error(`SHA-256 ของ ${safeName} หลังจัดเก็บไม่ตรง`);
      }
      const verified = await admin.from("beerthip_import_files").update({ source_status: "VERIFIED",
        verified_sha256: storedHash, verified_at: new Date().toISOString() }).eq("id", file.id);
      if (verified.error) throw new Error(`บันทึกผลตรวจ ${safeName} ไม่สำเร็จ: ${verified.error.message}`);
    }
  }

  async stage(files: readonly File[]): Promise<string> {
    if (files.length < 1 || files.length > 50) throw new Error("เลือกไฟล์ XLSX 1–50 ไฟล์");
    if (files.reduce((total, file) => total + file.size, 0) > 5_000_000) throw new Error("ขนาดไฟล์รวมต้องไม่เกิน 5 MB");
    const client = await createSupabaseServerClient();
    const organization = await client.from("organizations").select("id")
      .eq("code", BEERTHIP_ORGANIZATION_CODE).eq("active", true).single();
    if (organization.error || !organization.data) throw new Error("ไม่พบองค์กร Beerthip สำหรับนำเข้า");
    const organizationId = String(organization.data.id);
    const [departmentsResult, employeesResult, audiogramsResult] = await Promise.all([
      client.from("departments").select("code,name").eq("organization_id", organizationId),
      client.from("employees").select("id,employee_number,first_name,last_name").eq("organization_id", organizationId),
      client.from("audiograms").select("employee_id,exam_date,exam_type").eq("organization_id", organizationId).eq("record_status", "FINAL"),
    ]);
    const databaseError = [departmentsResult, employeesResult, audiogramsResult].find((result) => result.error)?.error;
    if (databaseError) throw new Error(`อ่านข้อมูลสำหรับตรวจสอบไม่สำเร็จ: ${databaseError.message}`);
    const existingDepartments = (departmentsResult.data ?? []) as Array<{ code: string; name: string }>;
    const existingEmployees = (employeesResult.data ?? []) as Array<{ id: string; employee_number: string; first_name: string; last_name: string }>;
    const existingAudiograms = (audiogramsResult.data ?? []) as Array<{ employee_id: string; exam_date: string; exam_type: string }>;
    const employeeByNumber = new Map(existingEmployees.map((employee) => [employee.employee_number, employee]));
    const existingKeys = new Set(existingAudiograms.map((row) => `${row.employee_id}|${row.exam_date}|${row.exam_type}`));
    const seenNames = new Set<string>();
    const seenNumbers = new Set<string>();
    const sourceFiles: Array<{ name: string; sha256: string }> = [];
    const parsedFiles = [];
    for (const file of files) {
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || file.size > 1_000_000) {
        throw new Error("รองรับเฉพาะ .xlsx ขนาดไม่เกิน 1 MB ต่อไฟล์");
      }
      const safeName = file.name.replace(/[\u0000-\u001f/\\]/g, "_");
      if (seenNames.has(safeName.toLowerCase())) throw new Error(`ชื่อไฟล์ซ้ำ: ${safeName}`);
      seenNames.add(safeName.toLowerCase());
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseBeerthipAudioXlsx(safeName, bytes);
      if (seenNumbers.has(parsed.employeeNumber)) throw new Error(`รหัสพนักงานซ้ำระหว่างไฟล์: ${parsed.employeeNumber}`);
      seenNumbers.add(parsed.employeeNumber);
      sourceFiles.push({ name: safeName, sha256: createHash("sha256").update(bytes).digest("hex") });
      const baselineRow = parsed.rows.find((row) => row.data.examType === "BASELINE");
      if (!baselineRow) throw new Error(`${safeName}: ไม่มี Baseline`);
      const baseline: Audiogram = {
        id: `${parsed.employeeNumber}-baseline`, employeeId: parsed.employeeNumber,
        examDate: baselineRow.data.examDate, examType: "BASELINE", isValid: true,
        thresholds: measuredThresholdsFromObservations(baselineRow.data.observations),
      };
      for (const row of parsed.rows) {
        if (row.data.examType === "BASELINE") continue;
        const current: Audiogram = {
          id: `${parsed.employeeNumber}-${row.data.sourceRow}`, employeeId: parsed.employeeNumber,
          examDate: row.data.examDate, examType: row.data.examType, isValid: true,
          thresholds: measuredThresholdsFromObservations(row.data.observations),
        };
        const evaluatedAt = `${row.data.examDate}T05:00:00.000Z`;
        row.data.thaiEvaluation = evaluateThaiHearingRule(baseline, current, evaluatedAt);
        row.data.oshaEvaluation = evaluateOshaSts(baseline, current, evaluatedAt);
      }
      parsedFiles.push(parsed);
    }
    const departmentNames = [...new Set(parsedFiles.map((file) => file.department))]
      .sort((left, right) => left.localeCompare(right, "th"));
    let nextDepartment = Math.max(0, ...existingDepartments.map((department) => {
      const match = /^BTB-D(\d+)$/i.exec(department.code);
      return match ? Number(match[1]) : 0;
    })) + 1;
    const departmentProposals = departmentNames.map((name) => {
      const existing = existingDepartments.find((department) => normalized(department.name) === normalized(name));
      return { name, code: existing?.code ?? `BTB-D${String(nextDepartment++).padStart(3, "0")}`, existing: Boolean(existing) };
    });
    const seenExamKeys = new Set<string>();
    const rows: BeerthipStagedRow[] = [];
    for (const file of parsedFiles) {
      for (const sourceRow of file.rows) {
        const data = sourceRow.data;
        const messages = [...sourceRow.messages];
        const employee = employeeByNumber.get(data.employeeNumber);
        if (employee && (normalized(employee.first_name) !== normalized(data.firstName)
          || normalized(employee.last_name) !== normalized(data.lastName))) {
          messages.push(message("EMPLOYEE_NAME_MISMATCH", "ERROR", "ชื่อพนักงานในระบบไม่ตรงกับไฟล์"));
        }
        const key = `${data.employeeNumber}|${data.examDate}|${data.examType}`;
        if (seenExamKeys.has(key)) messages.push(message("DUPLICATE_IN_UPLOAD", "ERROR", "พนักงาน วันที่ และชนิดผลตรวจซ้ำในชุดอัปโหลด"));
        seenExamKeys.add(key);
        if (employee && existingKeys.has(`${employee.id}|${data.examDate}|${data.examType}`)) {
          messages.push(message("DUPLICATE_EXISTING_AUDIOGRAM", "ERROR", "มีผลตรวจนี้ในระบบแล้ว"));
        }
        rows.push({
          ordinal: rows.length + 1,
          data,
          classification: messages.some((item) => item.severity === "ERROR") ? "ERROR"
            : messages.length > 0 ? "WARNING" : "READY",
          messages,
        });
      }
    }
    const response = await client.rpc("stage_beerthip_xlsx_batch", {
      p_organization_id: organizationId,
      p_files: sourceFiles,
      p_departments: departmentProposals,
      p_rows: rows.map((row) => ({
        ordinal: row.ordinal,
        data: row.data,
        classification: row.classification,
        messages: row.messages,
      })),
    });
    if (response.error || typeof response.data !== "string") {
      throw new Error(`จัดเก็บ staging ไม่สำเร็จ: ${response.error?.message ?? "ผลลัพธ์ไม่ถูกต้อง"}`);
    }
    return response.data;
  }

  async list(): Promise<BeerthipBatch[]> {
    const client = await createSupabaseServerClient();
    const response = await client.from("beerthip_import_batches").select("*").order("uploaded_at", { ascending: false }).limit(50);
    if (response.error) throw new Error(response.error.message);
    return response.data as BeerthipBatch[];
  }

  async get(id: string): Promise<{ batch: BeerthipBatch; rows: BeerthipStoredRow[]; files: BeerthipStoredFile[] } | null> {
    const client = await createSupabaseServerClient();
    const batchResult = await client.from("beerthip_import_batches").select("*").eq("id", id).maybeSingle();
    if (batchResult.error) throw new Error(batchResult.error.message);
    if (!batchResult.data) return null;
    const rowsResult = await client.from("beerthip_import_rows").select("*").eq("batch_id", id).order("ordinal");
    if (rowsResult.error) throw new Error(rowsResult.error.message);
    const rows = rowsResult.data as BeerthipStoredRow[];
    const filesResult = await client.from("beerthip_import_files").select("*").eq("batch_id", id).order("source_filename");
    if (filesResult.error) throw new Error(filesResult.error.message);
    return { batch: batchResult.data as BeerthipBatch, rows, files: filesResult.data as BeerthipStoredFile[] };
  }
}

export function getBeerthipImportService(): BeerthipImportService {
  return new BeerthipImportService();
}
