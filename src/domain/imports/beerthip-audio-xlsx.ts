import * as XLSX from "@stackline/xlsx";
import type { AudiogramThresholdObservation } from "@/domain/hearing/types/audiogram";
import type { HearingRuleEvaluation } from "@/domain/hearing/types/evaluation";
import type { OshaStsEvaluation } from "@/domain/hearing/rules/osha-sts";
import type { ImportValidationMessage } from "./csv-audiometry-import";

const FREQUENCIES = [500, 1000, 2000, 3000, 4000, 6000, 8000] as const;
const FIRST_HISTORY_ROW = 9;
const LAST_HISTORY_ROW = 27;
const EXPECTED_HEADER = "บริษัท เบียร์ทิพย์ บริวเวอรี่ (1991) จำกัด / บริษัท เบฟเทค จำกัด";

export type BeerthipExamType = "BASELINE" | "ANNUAL" | "CONFIRMATION";

export type BeerthipAudioRow = {
  employeeNumber: string;
  title: string;
  firstName: string;
  lastName: string;
  sex: "MALE" | "FEMALE" | null;
  department: string;
  employmentStartDate: string | null;
  ageSnapshot: number | null;
  tenureSnapshot: number | null;
  hcpStatus: string;
  examDate: string;
  examType: BeerthipExamType;
  sourceSurveillanceYear: number;
  sourceFilename: string;
  sourceSheet: "Audio";
  sourceRow: number;
  sourceCompanyHeader: string;
  sourceInterpretations: Record<string, string>;
  sourceAverages: { right: number | null; left: number | null };
  sourceMonitoringRow: number | null;
  lateConfirmation: boolean;
  observations: AudiogramThresholdObservation[];
  thaiEvaluation?: HearingRuleEvaluation;
  oshaEvaluation?: OshaStsEvaluation;
};

export type BeerthipParsedFile = {
  filename: string;
  employeeNumber: string;
  department: string;
  rows: Array<{ data: BeerthipAudioRow; messages: ImportValidationMessage[] }>;
};

function text(sheet: XLSX.WorkSheet, address: string): string {
  const value = sheet[address]?.v;
  return value === undefined || value === null ? "" : String(value).trim();
}

function numericSnapshot(sheet: XLSX.WorkSheet, address: string): number | null {
  const raw = sheet[address]?.v;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function dateAt(sheet: XLSX.WorkSheet, address: string, label: string): string | null {
  const cell = sheet[address];
  if (!cell || cell.v === null || cell.v === undefined || cell.v === "") return null;
  let year: number;
  let month: number;
  let day: number;
  if (cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
    year = cell.v.getUTCFullYear();
    month = cell.v.getUTCMonth() + 1;
    day = cell.v.getUTCDate();
  } else if (typeof cell.v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cell.v)) {
    [year, month, day] = cell.v.split("-").map(Number);
  } else {
    throw new Error(`${label}: รูปแบบวันที่ไม่ถูกต้อง`);
  }
  if (year >= 2400 && year <= 2699) year -= 543;
  if (year < 1900 || year > 2100) throw new Error(`${label}: ปีอยู่นอกช่วงที่รองรับ`);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw new Error(`${label}: ไม่ใช่วันที่จริง`);
  }
  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function observation(
  sheet: XLSX.WorkSheet,
  address: string,
  ear: "LEFT" | "RIGHT",
  frequencyHz: typeof FREQUENCIES[number],
  label: string,
): AudiogramThresholdObservation {
  const raw = sheet[address]?.v;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= -20 && raw <= 140 && raw % 5 === 0) {
    return { ear, frequencyHz, responseStatus: "MEASURED", thresholdDbHl: raw };
  }
  if (typeof raw === "string") {
    const match = /^>\s*(-?\d+)\s*$/.exec(raw.trim());
    if (match) {
      const at = Number(match[1]);
      if (at >= -20 && at <= 140 && at % 5 === 0) {
        return { ear, frequencyHz, responseStatus: "NO_RESPONSE", noResponseAtDbHl: at };
      }
    }
  }
  throw new Error(`${label}: ค่า ${address} ไม่ใช่ผลตรวจที่รองรับ`);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export function parseBeerthipAudioXlsx(filename: string, bytes: Uint8Array): BeerthipParsedFile {
  if (!/^Audio_\d+\.xlsx$/i.test(filename)) throw new Error(`${filename}: ชื่อไฟล์ต้องเป็น Audio_<รหัสพนักงาน>.xlsx`);
  if (bytes.byteLength === 0 || bytes.byteLength > 1_000_000) throw new Error(`${filename}: ไฟล์ต้องมีขนาดไม่เกิน 1 MB`);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: false, cellHTML: false });
  } catch {
    throw new Error(`${filename}: เปิด XLSX ไม่สำเร็จ`);
  }
  if (workbook.SheetNames.length !== 1 || workbook.SheetNames[0] !== "Audio") {
    throw new Error(`${filename}: ต้องมี sheet Audio เพียง sheet เดียว`);
  }
  const sheet = workbook.Sheets.Audio;
  if (text(sheet, "V1") !== EXPECTED_HEADER || text(sheet, "B7") !== "วันที่ตรวจ" || text(sheet, "C7") !== "ชนิดของการตรวจ") {
    throw new Error(`${filename}: โครงสร้างแบบฟอร์มไม่ตรงกับ Beerthip Audio`);
  }
  for (let index = 0; index < FREQUENCIES.length; index += 1) {
    if (text(sheet, `${XLSX.utils.encode_col(3 + index)}8`) !== String(FREQUENCIES[index])
      || text(sheet, `${XLSX.utils.encode_col(11 + index)}8`) !== String(FREQUENCIES[index])) {
      throw new Error(`${filename}: ลำดับความถี่ในแถว 8 ไม่ตรงกับแบบฟอร์ม`);
    }
  }
  const employeeNumber = text(sheet, "B3");
  const filenameNumber = /^Audio_(\d+)\.xlsx$/i.exec(filename)?.[1];
  if (!employeeNumber || employeeNumber !== filenameNumber) throw new Error(`${filename}: รหัสพนักงานใน B3 ไม่ตรงกับชื่อไฟล์`);
  const title = text(sheet, "D3");
  const firstName = text(sheet, "G3");
  const lastName = text(sheet, "M3");
  const department = text(sheet, "U3");
  if (!firstName || !lastName || !department) throw new Error(`${filename}: ชื่อ นามสกุล หรือแผนกว่าง`);
  const sex = title === "นาย" ? "MALE" : title === "นาง" || title === "น.ส." ? "FEMALE" : null;
  const employmentStartDate = dateAt(sheet, "B5", `${filename} วันที่เริ่มงาน`);
  const ageSnapshot = numericSnapshot(sheet, "Z3");
  const tenureSnapshot = numericSnapshot(sheet, "D5");
  const hcpStatus = text(sheet, "Z5");
  const rows: BeerthipParsedFile["rows"] = [];
  let sourceMonitoring: { row: number; date: string } | null = null;
  let baselineCount = 0;

  for (let row = FIRST_HISTORY_ROW; row <= LAST_HISTORY_ROW; row += 1) {
    const examDate = dateAt(sheet, `B${row}`, `${filename} แถว ${row}`);
    if (!examDate) {
      const hasThreshold = FREQUENCIES.some((_, index) =>
        [3 + index, 11 + index].some((column) => {
          const value = sheet[`${XLSX.utils.encode_col(column)}${row}`]?.v;
          return typeof value === "number" && Number.isFinite(value)
            || typeof value === "string" && /^>\s*-?\d+\s*$/.test(value.trim());
        }),
      );
      if (hasThreshold) throw new Error(`${filename} แถว ${row}: มีผลตรวจแต่ไม่มีวันที่ตรวจ`);
      continue; // Formula errors in empty Confirmed placeholders are not records.
    }
    const sourceType = text(sheet, `C${row}`);
    const examType: BeerthipExamType = sourceType === "Baseline" ? "BASELINE"
      : sourceType === "Monitoring" ? "ANNUAL"
        : sourceType === "Confirmed" ? "CONFIRMATION"
          : (() => { throw new Error(`${filename} แถว ${row}: ชนิดผลตรวจไม่รู้จัก`); })();
    const sourceSurveillanceYear = Number(text(sheet, `A${row}`));
    if (!Number.isInteger(sourceSurveillanceYear) || sourceSurveillanceYear < 2400 || sourceSurveillanceYear > 2699) {
      throw new Error(`${filename} แถว ${row}: ปีรอบเฝ้าระวังไม่ถูกต้อง`);
    }
    const observations = FREQUENCIES.flatMap((frequencyHz, index) => [
      observation(sheet, `${XLSX.utils.encode_col(3 + index)}${row}`, "RIGHT", frequencyHz, `${filename} แถว ${row}`),
      observation(sheet, `${XLSX.utils.encode_col(11 + index)}${row}`, "LEFT", frequencyHz, `${filename} แถว ${row}`),
    ]);
    const messages: ImportValidationMessage[] = [];
    if (observations.some((point) => point.responseStatus === "NO_RESPONSE")) {
      messages.push({ code: "NO_RESPONSE", severity: "WARNING", message: "พบค่า >90; เก็บเป็น NO_RESPONSE @ 90 dB HL" });
    }
    if (examType === "BASELINE") {
      baselineCount += 1;
      if (observations.some((point) => point.responseStatus !== "MEASURED")) {
        throw new Error(`${filename} แถว ${row}: Baseline ต้องมีผลวัดครบ 14 จุด`);
      }
      messages.push({
        code: "MISSING_QUIET_PERIOD_EVIDENCE",
        severity: "WARNING",
        message: "ไฟล์ไม่ระบุหลักฐานพักเสียงอย่างน้อย 14 ชั่วโมงก่อนตรวจ Baseline",
      });
    }
    if (examType === "CONFIRMATION") {
      if (!sourceMonitoring || daysBetween(sourceMonitoring.date, examDate) < 0) {
        throw new Error(`${filename} แถว ${row}: Confirmed ไม่มี Monitoring ก่อนหน้า`);
      }
      if (daysBetween(sourceMonitoring.date, examDate) > 30) {
        messages.push({ code: "LATE_CONFIRMATION", severity: "WARNING", message: `Confirmed หลัง Monitoring ${daysBetween(sourceMonitoring.date, examDate)} วัน` });
      }
    }
    const data: BeerthipAudioRow = {
      employeeNumber, title, firstName, lastName, sex, department, employmentStartDate,
      ageSnapshot, tenureSnapshot, hcpStatus, examDate, examType, sourceSurveillanceYear,
      sourceFilename: filename, sourceSheet: "Audio", sourceRow: row, sourceCompanyHeader: text(sheet, "V1"),
      sourceInterpretations: Object.fromEntries(["T", "U", "V", "W", "X", "Y", "Z"].map((column) => [column, text(sheet, `${column}${row}`)])),
      sourceAverages: { right: numericSnapshot(sheet, `K${row}`), left: numericSnapshot(sheet, `S${row}`) },
      sourceMonitoringRow: examType === "CONFIRMATION" ? sourceMonitoring?.row ?? null : null,
      lateConfirmation: messages.some((message) => message.code === "LATE_CONFIRMATION"),
      observations,
    };
    rows.push({ data, messages });
    if (examType === "ANNUAL") sourceMonitoring = { row, date: examDate };
  }
  if (baselineCount !== 1 || rows.length === 0) throw new Error(`${filename}: ต้องมี Baseline หนึ่งรายการ`);
  return { filename, employeeNumber, department, rows };
}
