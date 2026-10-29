import type { Audiogram } from "@/domain/hearing/types/audiogram";
import type {
  CsvColumnMapping,
  ImportValidationMessage,
} from "@/domain/imports/csv-audiometry-import";

export const CREATABLE_IMPORT_EXAM_TYPES = [
  "ANNUAL",
  "CONFIRMATION",
  "OTHER",
] as const;

export type CreatableImportExamType = typeof CREATABLE_IMPORT_EXAM_TYPES[number];
export type ImportExamType = CreatableImportExamType | "REPEAT";

export type ImportBatchStatus =
  | "UPLOADED"
  | "VALIDATING"
  | "READY"
  | "IMPORTING"
  | "COMPLETED"
  | "FAILED"
  | "ROLLED_BACK";

export type ImportBatchListItem = {
  id: string;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  organizationNameTh: string | null;
  filename: string;
  uploadedAt: string;
  status: ImportBatchStatus;
  examType: ImportExamType;
  rowsTotal: number;
  rowsSuccess: number;
  rowsWarning: number;
  rowsFailed: number;
  headers: string[];
  columnMapping: CsvColumnMapping;
  existingEmployeesMatched: number;
  newEmployeesCreated: number;
  audiogramsImported: number;
  thresholdShiftsDetected: number;
  followUpCasesCreated: number;
  completedAt: string | null;
  errorMessage: string | null;
};

export type ImportBatchRow = {
  id: string;
  batchId: string;
  organizationId: string;
  rowNumber: number;
  source: Record<string, string>;
  normalized: Record<string, unknown> | null;
  classification: "READY" | "WARNING" | "ERROR" | null;
  messages: ImportValidationMessage[];
  matchedEmployeeId: string | null;
};

export type ImportDepartmentContext = {
  id: string;
  code: string;
  name: string;
};

export type ImportEmployeeContext = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  departmentId: string | null;
};

export type ImportBaselineContext = {
  historyId: string;
  employeeId: string;
  audiogram: Audiogram;
};

export type ImportValidationContext = {
  departments: ImportDepartmentContext[];
  employees: ImportEmployeeContext[];
  existingAudiogramKeys: string[];
  baselines: ImportBaselineContext[];
};

export type ValidatedImportRow = {
  id: string;
  normalized: Record<string, unknown>;
  classification: "READY" | "WARNING" | "ERROR";
  messages: ImportValidationMessage[];
  matchedEmployeeId: string | null;
};

export type ImportValidationSummary = {
  batchId: string;
  status: "READY" | "VALIDATING";
  rowsTotal: number;
  rowsReady: number;
  rowsWarning: number;
  rowsError: number;
};

export type CommitImportResult = {
  success: boolean;
  batchId: string;
  rowsImported?: number;
  existingEmployeesMatched?: number;
  newEmployeesCreated?: number;
  thresholdShiftsDetected?: number;
  followUpCasesCreated?: number;
  error?: string;
};
