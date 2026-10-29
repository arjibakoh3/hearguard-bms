import { evaluateOshaSts } from "@/domain/hearing/rules/osha-sts";
import { evaluateThaiHearingRule } from "@/domain/hearing/rules/thai-hearing-2561";
import type { Audiogram } from "@/domain/hearing/types/audiogram";
import {
  normalizeCsvAudiometryRow,
  parseCsvText,
  validateCsvColumnMapping,
  type CsvColumnMapping,
  type ImportValidationMessage,
} from "@/domain/imports/csv-audiometry-import";
import type { HearGuardImportRepository } from "./ports/hearguard-import-repository";
import type {
  CreatableImportExamType,
  ImportBatchListItem,
  ImportValidationContext,
  ImportValidationSummary,
  ValidatedImportRow,
} from "./import-view-models";

const MAX_CSV_BYTES = 750_000;
const MAX_CSV_ROWS = 2_000;

function normalizedLookup(value: string): string {
  return value.trim().toLocaleLowerCase("th-TH");
}

function sameText(left: string, right: string): boolean {
  return normalizedLookup(left) === normalizedLookup(right);
}

function audiogramKey(employeeId: string, examDate: string, examType: string): string {
  return `${employeeId}|${examDate}|${examType}`;
}

function evaluatedAtForDate(examDate: string, minute: number): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : "1970-01-01";
  return new Date(`${safeDate}T05:${String(minute).padStart(2, "0")}:00.000Z`).toISOString();
}

function classify(messages: ImportValidationMessage[]): "READY" | "WARNING" | "ERROR" {
  if (messages.some((message) => message.severity === "ERROR")) return "ERROR";
  if (messages.some((message) => message.severity === "WARNING")) return "WARNING";
  return "READY";
}

function addWarning(
  messages: ImportValidationMessage[],
  code: string,
  message: string,
): void {
  messages.push({ code, severity: "WARNING", message });
}

function addError(
  messages: ImportValidationMessage[],
  code: string,
  message: string,
): void {
  messages.push({ code, severity: "ERROR", message });
}

function findDepartment(context: ImportValidationContext, value: string) {
  const lookup = normalizedLookup(value);
  if (!lookup) return null;
  return context.departments.find(
    (department) => normalizedLookup(department.code) === lookup
      || normalizedLookup(department.name) === lookup,
  ) ?? null;
}

function oshaSnapshot(baseline: Audiogram | null, current: Audiogram, evaluatedAt: string) {
  const evaluation = evaluateOshaSts(baseline, current, evaluatedAt);
  const statusText = evaluation.status === "not_evaluable"
    ? "ยังประเมินไม่ได้จนกว่าจะมี operational baseline ที่ครบถ้วน"
    : evaluation.status === "positive"
      ? "พบผลบวกตามตัวเปรียบเทียบ OSHA แบบอิสระ โดยไม่เปลี่ยน workflow กฎไทย"
      : "ไม่พบ OSHA STS จากตัวเปรียบเทียบแบบอิสระ";
  return {
    ...evaluation,
    explanation: statusText,
    recommendedAction: evaluation.status === "positive"
      ? "ทบทวนผล OSHA แยกจากกฎปฏิบัติการของไทย"
      : "ดำเนินการเฝ้าระวังตาม workflow กฎไทยต่อไป",
  };
}

export class HearGuardImportService {
  constructor(private readonly repository: HearGuardImportRepository) {}

  async createBatch(input: {
    organizationId: string;
    filename: string;
    csvText: string;
    examType: CreatableImportExamType;
  }): Promise<string> {
    if (new TextEncoder().encode(input.csvText).byteLength > MAX_CSV_BYTES) {
      throw new Error("ไฟล์ CSV ต้องมีขนาดไม่เกิน 750 KB");
    }
    const parsed = parseCsvText(input.csvText);
    if (parsed.rows.length > MAX_CSV_ROWS) {
      throw new Error(`CSV หนึ่ง batch รองรับสูงสุด ${MAX_CSV_ROWS.toLocaleString("th-TH")} แถว`);
    }
    return this.repository.createBatch({
      organizationId: input.organizationId,
      filename: input.filename,
      headers: parsed.headers,
      rows: parsed.rows,
      examType: input.examType,
    });
  }

  listBatches(): Promise<ImportBatchListItem[]> {
    return this.repository.listBatches();
  }

  getBatch(id: string) {
    return this.repository.getBatch(id);
  }

  listBatchRows(id: string) {
    return this.repository.listBatchRows(id);
  }

  async validateBatch(batchId: string, mapping: CsvColumnMapping): Promise<ImportValidationSummary> {
    const batch = await this.repository.getBatch(batchId);
    if (!batch) throw new Error("ไม่พบ import batch");
    if (!["UPLOADED", "VALIDATING", "FAILED"].includes(batch.status)) {
      throw new Error("batch นี้ไม่สามารถตรวจสอบใหม่ได้");
    }

    const mappingMessages = validateCsvColumnMapping(mapping, batch.headers);
    if (mappingMessages.length > 0) {
      throw new Error(mappingMessages.map((message) => message.message).join(" · "));
    }

    const [rows, context] = await Promise.all([
      this.repository.listBatchRows(batchId),
      this.repository.getValidationContext(batch.organizationId),
    ]);
    const employeeByNumber = new Map(
      context.employees.map((employee) => [normalizedLookup(employee.employeeNumber), employee]),
    );
    const baselineByEmployee = new Map(
      context.baselines.map((baseline) => [baseline.employeeId, baseline]),
    );
    const existingAudiogramKeys = new Set(context.existingAudiogramKeys);
    const seenSourceKeys = new Set<string>();
    const employeeRowCounts = new Map<string, number>();
    for (const row of rows) {
      const numberHeader = mapping.employeeNumber;
      const number = numberHeader ? normalizedLookup(row.source[numberHeader] ?? "") : "";
      if (number) employeeRowCounts.set(number, (employeeRowCounts.get(number) ?? 0) + 1);
    }

    const validatedRows: ValidatedImportRow[] = rows.map((row) => {
      const normalizedResult = normalizeCsvAudiometryRow(row.source, mapping);
      const data = normalizedResult.data;
      const messages = [...normalizedResult.messages];
      const employee = employeeByNumber.get(normalizedLookup(data.employeeNumber)) ?? null;
      const department = findDepartment(context, data.department);

      if (data.department && !department) {
        addError(messages, "UNKNOWN_DEPARTMENT", `ไม่พบแผนก “${data.department}” ในสถานประกอบการนี้`);
      }

      if (employee) {
        if (data.firstName && !sameText(data.firstName, employee.firstName)) {
          addWarning(messages, "FIRST_NAME_MISMATCH", `ชื่อในไฟล์ไม่ตรงกับพนักงาน ${employee.employeeNumber}; ระบบจะคงชื่อเดิม`);
        }
        if (data.lastName && !sameText(data.lastName, employee.lastName)) {
          addWarning(messages, "LAST_NAME_MISMATCH", `นามสกุลในไฟล์ไม่ตรงกับพนักงาน ${employee.employeeNumber}; ระบบจะคงข้อมูลเดิม`);
        }
        if (department && employee.departmentId && department.id !== employee.departmentId) {
          addWarning(messages, "DEPARTMENT_MISMATCH", `แผนกในไฟล์ต่างจากทะเบียนพนักงาน; ระบบจะคงแผนกเดิม`);
        }
      } else if (data.employeeNumber) {
        if (!data.firstName || !data.lastName) {
          addError(messages, "NEW_EMPLOYEE_NAME_REQUIRED", "พนักงานใหม่ต้องมีชื่อและนามสกุล");
        }
        if (!department) {
          addError(messages, "NEW_EMPLOYEE_DEPARTMENT_REQUIRED", "พนักงานใหม่ต้องระบุแผนกที่มีอยู่ในระบบ");
        }
        if (!messages.some((message) => message.severity === "ERROR")) {
          addWarning(messages, "NEW_EMPLOYEE", `จะสร้างพนักงานใหม่รหัส ${data.employeeNumber}`);
        }
      }

      if ((employeeRowCounts.get(normalizedLookup(data.employeeNumber)) ?? 0) > 1) {
        addWarning(messages, "REPEATED_EMPLOYEE_IN_FILE", "รหัสพนักงานนี้ปรากฏหลายแถว โปรดตรวจสอบวันที่ตรวจ");
      }

      const sourceKey = `${normalizedLookup(data.employeeNumber)}|${data.examDate}|${batch.examType}`;
      if (seenSourceKeys.has(sourceKey)) {
        addError(messages, "DUPLICATE_AUDIOGRAM_IN_FILE", "พนักงาน วันที่ตรวจ และประเภทการตรวจซ้ำกันในไฟล์นี้");
      } else if (data.employeeNumber && data.examDate) {
        seenSourceKeys.add(sourceKey);
      }

      if (employee && existingAudiogramKeys.has(audiogramKey(employee.id, data.examDate, batch.examType))) {
        addError(messages, "DUPLICATE_EXISTING_AUDIOGRAM", "มี audiogram ของพนักงาน วันที่ และประเภทนี้อยู่แล้ว");
      }

      const baselineContext = employee ? baselineByEmployee.get(employee.id) ?? null : null;
      const currentAudiogram: Audiogram = {
        id: `staged-row-${row.rowNumber}`,
        employeeId: employee?.id ?? `new-${data.employeeNumber || row.rowNumber}`,
        examDate: data.examDate || "0000-00-00",
        examType: batch.examType,
        isValid: messages.every((message) => message.severity !== "ERROR"),
        thresholds: data.thresholds,
      };
      const thaiEvaluatedAt = evaluatedAtForDate(data.examDate, 0);
      const oshaEvaluatedAt = evaluatedAtForDate(data.examDate, 1);
      const thaiEvaluation = evaluateThaiHearingRule(
        baselineContext?.audiogram ?? null,
        currentAudiogram,
        thaiEvaluatedAt,
      );
      const oshaEvaluation = oshaSnapshot(
        baselineContext?.audiogram ?? null,
        currentAudiogram,
        oshaEvaluatedAt,
      );
      const classification = classify(messages);

      return {
        id: row.id,
        matchedEmployeeId: employee?.id ?? null,
        classification,
        messages,
        normalized: {
          ...data,
          departmentId: department?.id ?? null,
          baselineAudiogramId: baselineContext?.audiogram.id ?? null,
          baselineHistoryId: baselineContext?.historyId ?? null,
          thaiEvaluation,
          oshaEvaluation,
          automaticRules: ["THAI_HEARING_2561", "OSHA_STS_29_CFR_1910_95"],
          nioshAutomaticallyEvaluated: false,
        },
      };
    });

    const rowsReady = validatedRows.filter((row) => row.classification === "READY").length;
    const rowsWarning = validatedRows.filter((row) => row.classification === "WARNING").length;
    const rowsError = validatedRows.filter((row) => row.classification === "ERROR").length;
    await this.repository.saveValidation({
      batchId,
      mapping,
      rows: validatedRows,
      rowsReady,
      rowsWarning,
      rowsError,
    });

    return {
      batchId,
      status: rowsError > 0 ? "VALIDATING" : "READY",
      rowsTotal: validatedRows.length,
      rowsReady,
      rowsWarning,
      rowsError,
    };
  }

  commitBatch(id: string) {
    return this.repository.commitBatch(id);
  }
}
