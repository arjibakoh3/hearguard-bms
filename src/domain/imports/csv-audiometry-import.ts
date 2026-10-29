import type { AudiogramThreshold, Ear, FrequencyHz } from "@/domain/hearing/types/audiogram";
import { SUPPORTED_FREQUENCIES_HZ } from "@/domain/hearing/types/audiogram";

export type ParsedCsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type ParsedCsv = {
  headers: string[];
  rows: ParsedCsvRow[];
};

export const CSV_IMPORT_FIELDS = [
  { key: "employeeNumber", label: "รหัสพนักงาน", required: true },
  { key: "firstName", label: "ชื่อ", required: false },
  { key: "lastName", label: "นามสกุล", required: false },
  { key: "department", label: "แผนก (รหัสหรือชื่อ)", required: false },
  { key: "examDate", label: "วันที่ตรวจ", required: true },
  ...(["LEFT", "RIGHT"] as const).flatMap((ear) =>
    SUPPORTED_FREQUENCIES_HZ.map((frequencyHz) => ({
      key: `${ear === "LEFT" ? "L" : "R"}${frequencyHz}`,
      label: `${ear === "LEFT" ? "หูซ้าย" : "หูขวา"} ${frequencyHz} Hz`,
      required: true,
    })),
  ),
] as const;

export type CsvImportField = (typeof CSV_IMPORT_FIELDS)[number]["key"];
export type CsvColumnMapping = Partial<Record<CsvImportField, string>>;

export type ImportMessageSeverity = "WARNING" | "ERROR";

export type ImportValidationMessage = {
  code: string;
  severity: ImportMessageSeverity;
  message: string;
  field?: CsvImportField;
};

export type NormalizedCsvAudiometryRow = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  examDate: string;
  thresholds: AudiogramThreshold[];
};

const FIELD_ALIASES: Record<CsvImportField, string[]> = {
  employeeNumber: [
    "employee_number",
    "employee_no",
    "employee_id",
    "emp_no",
    "รหัสพนักงาน",
  ],
  firstName: ["first_name", "firstname", "given_name", "ชื่อ"],
  lastName: ["last_name", "lastname", "surname", "นามสกุล"],
  department: ["department", "department_code", "dept", "แผนก"],
  examDate: ["exam_date", "test_date", "audiogram_date", "วันที่ตรวจ"],
  L500: thresholdAliases("LEFT", 500),
  L1000: thresholdAliases("LEFT", 1000),
  L2000: thresholdAliases("LEFT", 2000),
  L3000: thresholdAliases("LEFT", 3000),
  L4000: thresholdAliases("LEFT", 4000),
  L6000: thresholdAliases("LEFT", 6000),
  L8000: thresholdAliases("LEFT", 8000),
  R500: thresholdAliases("RIGHT", 500),
  R1000: thresholdAliases("RIGHT", 1000),
  R2000: thresholdAliases("RIGHT", 2000),
  R3000: thresholdAliases("RIGHT", 3000),
  R4000: thresholdAliases("RIGHT", 4000),
  R6000: thresholdAliases("RIGHT", 6000),
  R8000: thresholdAliases("RIGHT", 8000),
};

function thresholdAliases(ear: Ear, frequencyHz: FrequencyHz): string[] {
  const shortEar = ear === "LEFT" ? "l" : "r";
  const longEar = ear.toLowerCase();
  return [
    `${shortEar}${frequencyHz}`,
    `${shortEar}_${frequencyHz}`,
    `${longEar}_${frequencyHz}`,
    `${longEar}${frequencyHz}`,
    `${frequencyHz}_${shortEar}`,
  ];
}

function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s./\\()-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pushRecord(records: string[][], record: string[]): void {
  if (record.some((value) => value.trim() !== "")) records.push(record);
}

export function parseCsvText(input: string): ParsedCsv {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) throw new Error("รูปแบบ CSV ไม่ถูกต้อง: พบเครื่องหมายคำพูดกลางค่า");
      quoted = true;
    } else if (character === ",") {
      record.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field.trim());
      pushRecord(records, record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("รูปแบบ CSV ไม่ถูกต้อง: เครื่องหมายคำพูดปิดไม่ครบ");
  if (field.length > 0 || record.length > 0) {
    record.push(field.trim());
    pushRecord(records, record);
  }

  if (records.length < 2) throw new Error("CSV ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว");

  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => header === "")) throw new Error("หัวตาราง CSV ต้องไม่เว้นว่าง");
  if (new Set(headers).size !== headers.length) throw new Error("หัวตาราง CSV ต้องไม่ซ้ำกัน");

  const rows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`แถว ${index + 2} มี ${values.length} คอลัมน์ แต่หัวตารางมี ${headers.length} คอลัมน์`);
    }
    return {
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, values[column]])),
    };
  });

  return { headers, rows };
}

export function autoMapCsvHeaders(headers: string[]): CsvColumnMapping {
  const normalized = new Map(headers.map((header) => [normalizedHeader(header), header]));
  const mapping: CsvColumnMapping = {};

  for (const field of CSV_IMPORT_FIELDS) {
    const match = FIELD_ALIASES[field.key]
      .map(normalizedHeader)
      .map((alias) => normalized.get(alias))
      .find(Boolean);
    if (match) mapping[field.key] = match;
  }

  return mapping;
}

export function validateCsvColumnMapping(
  mapping: CsvColumnMapping,
  headers: string[],
): ImportValidationMessage[] {
  const messages: ImportValidationMessage[] = [];
  const headerSet = new Set(headers);
  const mappedHeaders = new Map<string, CsvImportField>();

  for (const field of CSV_IMPORT_FIELDS) {
    const header = mapping[field.key];
    if (!header) {
      if (field.required) {
        messages.push({
          code: "MISSING_COLUMN_MAPPING",
          severity: "ERROR",
          field: field.key,
          message: `ยังไม่ได้จับคู่คอลัมน์ ${field.label}`,
        });
      }
      continue;
    }
    if (!headerSet.has(header)) {
      messages.push({
        code: "UNKNOWN_SOURCE_COLUMN",
        severity: "ERROR",
        field: field.key,
        message: `ไม่พบคอลัมน์ต้นทาง “${header}”`,
      });
      continue;
    }
    const previousField = mappedHeaders.get(header);
    if (previousField) {
      messages.push({
        code: "DUPLICATE_COLUMN_MAPPING",
        severity: "ERROR",
        field: field.key,
        message: `คอลัมน์ “${header}” ถูกจับคู่ซ้ำ`,
      });
    } else {
      mappedHeaders.set(header, field.key);
    }
  }

  return messages;
}

function mappedValue(
  source: Record<string, string>,
  mapping: CsvColumnMapping,
  field: CsvImportField,
): string {
  const header = mapping[field];
  return header ? (source[header] ?? "").trim() : "";
}

function parseDate(value: string): string | null {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const thaiMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : thaiMatch
      ? { year: Number(thaiMatch[3]), month: Number(thaiMatch[2]), day: Number(thaiMatch[1]) }
      : null;
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    date.getUTCFullYear() !== parts.year
    || date.getUTCMonth() !== parts.month - 1
    || date.getUTCDate() !== parts.day
  ) return null;
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function normalizeCsvAudiometryRow(
  source: Record<string, string>,
  mapping: CsvColumnMapping,
): { data: NormalizedCsvAudiometryRow; messages: ImportValidationMessage[] } {
  const messages: ImportValidationMessage[] = [];
  const employeeNumber = mappedValue(source, mapping, "employeeNumber");
  const rawExamDate = mappedValue(source, mapping, "examDate");
  const examDate = parseDate(rawExamDate);

  if (!employeeNumber) {
    messages.push({
      code: "MISSING_EMPLOYEE_NUMBER",
      severity: "ERROR",
      field: "employeeNumber",
      message: "ไม่มีรหัสพนักงาน",
    });
  }
  if (!examDate) {
    messages.push({
      code: "INVALID_EXAM_DATE",
      severity: "ERROR",
      field: "examDate",
      message: rawExamDate ? `วันที่ตรวจ “${rawExamDate}” ไม่ถูกต้อง` : "ไม่มีวันที่ตรวจ",
    });
  }

  const thresholds: AudiogramThreshold[] = [];
  for (const ear of ["LEFT", "RIGHT"] as const) {
    for (const frequencyHz of SUPPORTED_FREQUENCIES_HZ) {
      const field = `${ear === "LEFT" ? "L" : "R"}${frequencyHz}` as CsvImportField;
      const value = mappedValue(source, mapping, field);
      const thresholdDbHl = Number(value);
      if (value === "" || !Number.isFinite(thresholdDbHl)) {
        messages.push({
          code: value === "" ? "MISSING_THRESHOLD" : "NON_NUMERIC_THRESHOLD",
          severity: "ERROR",
          field,
          message: value === ""
            ? `ไม่มีค่า ${field}`
            : `ค่า ${field} “${value}” ไม่ใช่ตัวเลข`,
        });
        continue;
      }
      if (thresholdDbHl < -20 || thresholdDbHl > 140) {
        messages.push({
          code: "THRESHOLD_OUT_OF_RANGE",
          severity: "ERROR",
          field,
          message: `ค่า ${field} ต้องอยู่ระหว่าง -20 ถึง 140 dB HL`,
        });
        continue;
      }
      thresholds.push({ ear, frequencyHz, thresholdDbHl });
    }
  }

  return {
    data: {
      employeeNumber,
      firstName: mappedValue(source, mapping, "firstName"),
      lastName: mappedValue(source, mapping, "lastName"),
      department: mappedValue(source, mapping, "department"),
      examDate: examDate ?? rawExamDate,
      thresholds,
    },
    messages,
  };
}
