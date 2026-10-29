import { z } from "zod";
import {
  AudiogramThresholdObservationSchema,
  EarSchema,
  FrequencyHzSchema,
  SUPPORTED_FREQUENCIES_HZ,
  type AudiogramThresholdObservation,
} from "@/domain/hearing";

export const PAPERLESS_EXAM_TYPES = [
  "BASELINE",
  "ANNUAL",
  "REPEAT",
  "CONFIRMATION",
  "OTHER",
] as const;

export const CREATABLE_PAPERLESS_EXAM_TYPES = [
  "BASELINE",
  "ANNUAL",
  "CONFIRMATION",
  "OTHER",
] as const;

export const IMPORTANT_HEARING_HISTORY_CATEGORIES = [
  "PRE_EXISTING_HEARING_LOSS",
  "PRE_EXISTING_HEARING_DISABILITY",
  "OTHER_IMPORTANT_HEARING_HISTORY",
] as const;

export const ImportantHearingConditionSchema = z.object({
  id: z.string().uuid().nullable(),
  category: z.enum(IMPORTANT_HEARING_HISTORY_CATEGORIES),
  earScope: z.enum(["LEFT", "RIGHT", "BOTH", "UNKNOWN"]),
  onset: z.enum(["CONGENITAL_OR_CHILDHOOD", "LATER", "UNKNOWN"]),
  source: z.enum(["PATIENT_OR_FAMILY", "PRIOR_MEDICAL_RECORD", "PHYSICIAN_CONFIRMED"]),
  details: z.string().trim().max(2000),
  status: z.enum(["ACTIVE", "INACTIVE", "ENTERED_IN_ERROR"]),
  statusReason: z.string().trim().max(1000),
}).superRefine((value, context) => {
  if (value.status !== "ACTIVE" && !value.statusReason) {
    context.addIssue({
      code: "custom",
      path: ["statusReason"],
      message: "ประวัติที่ยกเลิกหรือบันทึกผิดต้องระบุเหตุผล",
    });
  }
});

export const ImportantHistoryCaptureModeSchema = z.enum([
  "CONFIRMED_CURRENT",
  "UPDATED_CURRENT",
  "COPY_SOURCE",
  "LEGACY_NONE",
]);

export type ImportantHearingCondition = z.infer<typeof ImportantHearingConditionSchema> & {
  patientId?: string;
  recordedAt?: string;
  recordedBy?: string | null;
};

export type ImportantHearingConditionSnapshot = Omit<ImportantHearingCondition, "patientId" | "statusReason"> & {
  snapshotId: string;
  sourceConditionId: string | null;
  capturedAt: string;
};

export type HospitalAudiometerOption = {
  id: string;
  displayName: string;
  model: string;
  serialNumber: string;
  location: string;
  calibrationDate: string | null;
  active: boolean;
};

export type HospitalExaminerOption = {
  id: string;
  fullName: string;
  email: string;
  organizationIds: string[];
  global: boolean;
};

export const PAPERLESS_HISTORY_QUESTIONS = [
  { code: "TINNITUS", label: "มีเสียงดังในหู" },
  { code: "DIZZINESS", label: "มีอาการเวียนศีรษะหรือเสียการทรงตัว" },
  { code: "EAR_PAIN", label: "มีอาการปวดหู" },
  { code: "EAR_FULLNESS", label: "รู้สึกหูอื้อหรือแน่นหู" },
  { code: "FLUCTUATING_HEARING", label: "การได้ยินเปลี่ยนขึ้นลง" },
  { code: "SUDDEN_HEARING_CHANGE", label: "เคยสูญเสียการได้ยินเฉียบพลัน" },
  { code: "HEARING_DIFFICULTY", label: "รู้สึกว่าการได้ยินลดลง" },
  { code: "EAR_INFECTION_OR_DISEASE", label: "เคยติดเชื้อหรือมีโรคเกี่ยวกับหู" },
  { code: "EAR_SPECIALIST_EVALUATION", label: "เคยพบแพทย์เฉพาะทางหู" },
  { code: "EAR_SURGERY", label: "เคยผ่าตัดหู" },
  { code: "HEAD_INJURY_OR_UNCONSCIOUSNESS", label: "เคยบาดเจ็บศีรษะหรือหมดสติ" },
  { code: "FAMILY_HEARING_LOSS", label: "มีประวัติการสูญเสียการได้ยินในครอบครัว" },
  { code: "PRIOR_HEARING_TEST", label: "เคยตรวจการได้ยินมาก่อน" },
  { code: "HEARING_AID_EVALUATION_OR_USE", label: "เคยประเมินหรือใช้เครื่องช่วยฟัง" },
  { code: "OTOTOXIC_MEDICATION", label: "เคยใช้ยาที่อาจมีพิษต่อหู" },
  { code: "OTOTOXIC_CHEMICAL_OR_SOLVENT", label: "สัมผัสสารเคมีหรือตัวทำละลายที่อาจมีพิษต่อหู" },
  { code: "PRIOR_OR_SECOND_NOISY_JOB", label: "เคยทำงานอื่นที่มีเสียงดัง" },
  { code: "NOISY_HOBBY", label: "มีกิจกรรมหรืองานอดิเรกเสียงดัง" },
  { code: "FIREARMS", label: "มีประวัติใช้อาวุธปืน" },
  { code: "MILITARY_SERVICE", label: "เคยรับราชการทหาร" },
  { code: "HEARING_PROTECTION_USE", label: "ใช้อุปกรณ์ป้องกันการได้ยิน" },
] as const;

export type PaperlessHistoryQuestionCode = typeof PAPERLESS_HISTORY_QUESTIONS[number]["code"];

export const PAPERLESS_HISTORY_GROUPS = [
  {
    label: "อาการทางหูและการได้ยิน",
    codes: [
      "TINNITUS", "DIZZINESS", "EAR_PAIN", "EAR_FULLNESS",
      "FLUCTUATING_HEARING", "SUDDEN_HEARING_CHANGE", "HEARING_DIFFICULTY",
    ],
  },
  {
    label: "โรค การรักษา และการผ่าตัดหู",
    codes: [
      "EAR_INFECTION_OR_DISEASE", "EAR_SPECIALIST_EVALUATION", "EAR_SURGERY",
      "HEARING_AID_EVALUATION_OR_USE",
    ],
  },
  {
    label: "อุบัติเหตุ ครอบครัว ยา และสารเคมี",
    codes: [
      "HEAD_INJURY_OR_UNCONSCIOUSNESS", "FAMILY_HEARING_LOSS",
      "OTOTOXIC_MEDICATION", "OTOTOXIC_CHEMICAL_OR_SOLVENT",
    ],
  },
  {
    label: "งาน งานอดิเรก อาวุธปืน และทหาร",
    codes: [
      "PRIOR_OR_SECOND_NOISY_JOB", "NOISY_HOBBY", "FIREARMS", "MILITARY_SERVICE",
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  codes: readonly PaperlessHistoryQuestionCode[];
}>;

export const PAPERLESS_ALWAYS_ASK_HISTORY_CODES = [
  "PRIOR_HEARING_TEST",
  "HEARING_PROTECTION_USE",
] as const satisfies readonly PaperlessHistoryQuestionCode[];

export const PAPERLESS_EAR_RELATED_HISTORY_CODES = [
  "TINNITUS", "EAR_PAIN", "EAR_FULLNESS", "FLUCTUATING_HEARING",
  "SUDDEN_HEARING_CHANGE", "HEARING_DIFFICULTY", "EAR_INFECTION_OR_DISEASE",
  "EAR_SPECIALIST_EVALUATION", "EAR_SURGERY", "HEARING_AID_EVALUATION_OR_USE",
] as const satisfies readonly PaperlessHistoryQuestionCode[];

const AnswerSchema = z.enum(["YES", "NO", "UNKNOWN"]);
const ExamTypeSchema = z.enum(PAPERLESS_EXAM_TYPES);
export const HistoryCaptureModeSchema = z.enum([
  "QUICK_SCREEN",
  "UNCHANGED_FROM_PRIOR",
  "UPDATED_FROM_PRIOR",
  "LEGACY_FULL",
]);

export const PaperlessHistoryResponseSchema = z.object({
  questionCode: z.enum(PAPERLESS_HISTORY_QUESTIONS.map((item) => item.code)),
  answer: AnswerSchema,
  earScope: z.enum(["LEFT", "RIGHT", "BOTH"]).nullable(),
  details: z.string().trim().max(1000),
});

export const PaperlessOtoscopyFindingSchema = z.object({
  ear: EarSchema,
  examinationStatus: z.enum(["NORMAL", "ABNORMAL", "NOT_EXAMINED"]),
  canalObstruction: z.boolean(),
  abnormalTympanicMembrane: z.boolean(),
  perforation: z.boolean(),
  otherFinding: z.boolean(),
  notes: z.string().trim().max(1000),
});

export const PaperlessAudiogramInputSchema = z.object({
  organizationId: z.string().uuid(),
  employeeId: z.string().uuid(),
  examType: ExamTypeSchema,
  examinedAt: z.iso.datetime(),
  testContext: z.string().trim().max(1000),
  hoursSinceNoiseExposure: z.number().min(0).max(168).nullable(),
  audiometerId: z.string().uuid().nullable(),
  examinerUserId: z.string().uuid().nullable(),
  equipmentCalibrationAcknowledged: z.boolean(),
  isValid: z.boolean(),
  validationNotes: z.string().trim().max(2000),
  sourceMonitoringAudiogramId: z.string().uuid().nullable(),
  followUpCaseId: z.string().uuid().nullable(),
  supersedesAudiogramId: z.string().uuid().nullable(),
  pretest: z.object({
    historyCaptureMode: HistoryCaptureModeSchema,
    sourceHistoryAudiogramId: z.string().uuid().nullable(),
    quietPeriodAnswer: AnswerSchema,
    quietPeriodHours: z.number().min(0).max(168).nullable(),
    hearingProtectionDuringQuiet: AnswerSchema,
    highNonoccupationalNoise: AnswerSchema,
    generalNotes: z.string().trim().max(2000),
  }).superRefine((value, context) => {
    const reusesPrior = value.historyCaptureMode === "UNCHANGED_FROM_PRIOR"
      || value.historyCaptureMode === "UPDATED_FROM_PRIOR";
    if (reusesPrior && !value.sourceHistoryAudiogramId) {
      context.addIssue({
        code: "custom",
        path: ["sourceHistoryAudiogramId"],
        message: "การยืนยันหรือแก้ประวัติเดิมต้องมี Final record ต้นทาง",
      });
    }
    if (!reusesPrior && value.sourceHistoryAudiogramId) {
      context.addIssue({
        code: "custom",
        path: ["sourceHistoryAudiogramId"],
        message: "Quick screen และ Legacy history ต้องไม่อ้าง record ต้นทาง",
      });
    }
  }),
  importantHistory: z.object({
    captureMode: ImportantHistoryCaptureModeSchema,
    sourceAudiogramId: z.string().uuid().nullable(),
    conditions: z.array(ImportantHearingConditionSchema).max(12),
  }).superRefine((value, context) => {
    if (value.captureMode === "COPY_SOURCE" && !value.sourceAudiogramId) {
      context.addIssue({
        code: "custom",
        path: ["sourceAudiogramId"],
        message: "Correction ต้องอ้าง snapshot จาก Final record ต้นฉบับ",
      });
    }
    if (value.captureMode !== "COPY_SOURCE" && value.sourceAudiogramId) {
      context.addIssue({
        code: "custom",
        path: ["sourceAudiogramId"],
        message: "เฉพาะ correction เท่านั้นที่คัดลอก important history จาก record ต้นฉบับ",
      });
    }
  }),
  historyResponses: z.array(PaperlessHistoryResponseSchema).max(PAPERLESS_HISTORY_QUESTIONS.length),
  otoscopyFindings: z.array(PaperlessOtoscopyFindingSchema).max(2),
  thresholds: z.array(AudiogramThresholdObservationSchema).max(14),
});

export type PaperlessAudiogramInput = z.infer<typeof PaperlessAudiogramInputSchema>;
export type PaperlessHistoryResponse = PaperlessAudiogramInput["historyResponses"][number];
export type HistoryCaptureMode = z.infer<typeof HistoryCaptureModeSchema>;
export type QuickHistoryState = "NONE" | "HAS_FINDINGS" | "UNKNOWN";

export type PriorHistorySnapshot = {
  sourceAudiogramId: string;
  examinedAt: string;
  examType: PaperlessAudiogramInput["examType"];
  positiveResponses: PaperlessHistoryResponse[];
  priorHearingTestAnswer: PaperlessHistoryResponse["answer"];
  hearingProtectionUseAnswer: PaperlessHistoryResponse["answer"];
  responses: PaperlessHistoryResponse[];
  importantHistory: ImportantHearingCondition[];
};

export type ImportantHearingHistoryState = {
  patientId: string;
  conditions: ImportantHearingCondition[];
};

export type HospitalEmployeeOption = {
  id: string;
  patientId: string;
  organizationId: string;
  departmentId: string | null;
  employeeNumber: string;
  fullName: string;
  hospitalNumber: string;
  organizationName: string;
  departmentName: string | null;
  hasActiveBaseline: boolean;
};

export type HospitalPatientEmploymentSummary = {
  patientId: string;
  hospitalNumber: string;
  hasHiddenEmployment: boolean;
  employments: Array<{
    employeeId: string;
    organizationId: string;
    organizationName: string;
    organizationNameTh: string | null;
    employeeNumber: string;
    fullName: string;
    employmentStartDate: string | null;
    employmentEndDate: string | null;
    active: boolean;
    canManage: boolean;
  }>;
};

export type HospitalPatientTimeline = {
  patientId: string;
  hospitalNumber: string;
  displayName: string;
  importantHistory: ImportantHearingCondition[];
  employments: Array<{
    employeeId: string;
    organizationId: string;
    organizationName: string;
    organizationNameTh: string | null;
    employeeNumber: string;
    fullName: string;
    employmentStartDate: string | null;
    employmentEndDate: string | null;
    active: boolean;
    activeBaselineDate: string | null;
    openFollowUpStatus: string | null;
    audiograms: Array<{
      id: string;
      examType: PaperlessAudiogramInput["examType"];
      examinedAt: string;
      recordStatus: PaperlessDirectoryRecord["recordStatus"];
    }>;
  }>;
  transitions: Array<{
    id: string;
    fromEmployeeId: string;
    toEmployeeId: string;
    transitionMode: "TRANSFER" | "CONCURRENT";
    effectiveDate: string;
    status: "COMPLETED" | "PENDING_ADMIN_REVIEW";
  }>;
};

export type PendingEmploymentTransition = {
  id: string;
  hospitalNumber: string;
  employeeName: string;
  fromOrganizationName: string;
  toOrganizationName: string;
  effectiveDate: string;
  createdAt: string;
};

export type PaperlessDirectoryRecord = {
  id: string;
  organizationId: string;
  employeeId: string;
  recordStatus: "DRAFT" | "FINAL" | "SUPERSEDED" | "VOID";
  examType: PaperlessAudiogramInput["examType"];
  examDate: string;
  examinedAt: string;
  finalizedAt: string | null;
  employeeNumber: string;
  employeeName: string;
  hospitalNumber: string;
  organizationName: string;
  departmentName: string | null;
  examiner: string | null;
  location: string | null;
  observationCount: number;
};

export type PaperlessAudiogramRecord = PaperlessDirectoryRecord & PaperlessAudiogramInput & {
  createdAt: string;
  updatedAt: string;
  finalizedBy: string | null;
  audiometerModel: string;
  audiometerSerial: string;
  calibrationDate: string;
  examiner: string;
  location: string;
  equipmentCalibrationStatus: "CURRENT" | "OVERDUE" | "UNKNOWN" | null;
  importantHistorySnapshotPresent: boolean;
  importantHistorySnapshots: ImportantHearingConditionSnapshot[];
  historySource: { id: string; examinedAt: string } | null;
  revisionChain: Array<{
    id: string;
    recordStatus: PaperlessDirectoryRecord["recordStatus"];
    examinedAt: string;
    finalizedAt: string | null;
  }>;
};

export type PaperlessWorkspace = {
  employees: HospitalEmployeeOption[];
  organizations: Array<{
    id: string;
    code: string;
    name: string;
    nameTh: string | null;
    label: string;
  }>;
  departments: Array<{ id: string; organizationId: string; label: string }>;
  audiometers: HospitalAudiometerOption[];
  examiners: HospitalExaminerOption[];
  currentUserId: string;
  records: PaperlessDirectoryRecord[];
  sequences: Array<{
    monitoringAudiogramId: string;
    followUpCaseId: string;
    employeeId: string;
    examDate: string;
    status: string;
  }>;
};

export type RegisterHospitalEmployeeInput = {
  hospitalNumber: string;
  organizationId: string;
  departmentId: string | null;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  sex: string | null;
  dateOfBirth: string | null;
  jobTitle: string | null;
  employmentStartDate: string | null;
  transitionMode: "TRANSFER" | "CONCURRENT" | null;
  effectiveDate: string | null;
  priorEmployeeId: string | null;
};

export type RegisterHospitalOrganizationInput = {
  nameTh: string;
  name: string | null;
};

export type UpsertHospitalAudiometerInput = {
  id: string | null;
  displayName: string;
  model: string;
  serialNumber: string;
  location: string;
  calibrationDate: string | null;
  active: boolean;
};

export type ManageImportantHearingConditionInput = {
  employeeId: string;
  condition: z.infer<typeof ImportantHearingConditionSchema>;
};

export function createBlankPaperlessInput(
  employeeId = "",
  examinedAt = new Date().toISOString(),
  organizationId = "",
): PaperlessAudiogramInput {
  const thresholds: AudiogramThresholdObservation[] = (["LEFT", "RIGHT"] as const)
    .flatMap((ear) => SUPPORTED_FREQUENCIES_HZ.map((frequencyHz) => ({
      ear,
      frequencyHz,
      responseStatus: "NOT_TESTED" as const,
    })));
  return {
    organizationId,
    employeeId,
    examType: "ANNUAL",
    examinedAt,
    testContext: "",
    hoursSinceNoiseExposure: null,
    audiometerId: null,
    examinerUserId: null,
    equipmentCalibrationAcknowledged: false,
    isValid: true,
    validationNotes: "",
    sourceMonitoringAudiogramId: null,
    followUpCaseId: null,
    supersedesAudiogramId: null,
    pretest: {
      historyCaptureMode: "QUICK_SCREEN",
      sourceHistoryAudiogramId: null,
      quietPeriodAnswer: "UNKNOWN",
      quietPeriodHours: null,
      hearingProtectionDuringQuiet: "UNKNOWN",
      highNonoccupationalNoise: "UNKNOWN",
      generalNotes: "",
    },
    importantHistory: {
      captureMode: "UPDATED_CURRENT",
      sourceAudiogramId: null,
      conditions: [],
    },
    historyResponses: PAPERLESS_HISTORY_QUESTIONS.map(({ code }) => ({
      questionCode: code,
      answer: "UNKNOWN",
      earScope: null,
      details: "",
    })),
    otoscopyFindings: (["LEFT", "RIGHT"] as const).map((ear) => ({
      ear,
      examinationStatus: "NOT_EXAMINED",
      canalObstruction: false,
      abnormalTympanicMembrane: false,
      perforation: false,
      otherFinding: false,
      notes: "",
    })),
    thresholds,
  };
}

export function createBlankHistoryResponses(): PaperlessHistoryResponse[] {
  return PAPERLESS_HISTORY_QUESTIONS.map(({ code }) => ({
    questionCode: code,
    answer: "UNKNOWN",
    earScope: null,
    details: "",
  }));
}

const alwaysAskCodes = new Set<PaperlessHistoryQuestionCode>(PAPERLESS_ALWAYS_ASK_HISTORY_CODES);
const earRelatedCodes = new Set<PaperlessHistoryQuestionCode>(PAPERLESS_EAR_RELATED_HISTORY_CODES);

export function getQuickHistoryState(responses: PaperlessHistoryResponse[]): QuickHistoryState {
  const riskResponses = responses.filter((item) => !alwaysAskCodes.has(item.questionCode));
  if (riskResponses.some((item) => item.answer === "YES")) return "HAS_FINDINGS";
  if (riskResponses.length > 0 && riskResponses.every((item) => item.answer === "NO")) return "NONE";
  return "UNKNOWN";
}

export function applyQuickHistoryState(
  responses: PaperlessHistoryResponse[],
  state: QuickHistoryState,
): PaperlessHistoryResponse[] {
  const byCode = new Map(responses.map((item) => [item.questionCode, item]));
  return PAPERLESS_HISTORY_QUESTIONS.map(({ code }) => {
    const current = byCode.get(code) ?? {
      questionCode: code,
      answer: "UNKNOWN" as const,
      earScope: null,
      details: "",
    };
    if (alwaysAskCodes.has(code)) return current;
    if (state === "UNKNOWN") return { ...current, answer: "UNKNOWN", earScope: null, details: "" };
    if (state === "NONE") return { ...current, answer: "NO", earScope: null, details: "" };
    return current.answer === "YES" ? current : { ...current, answer: "NO", earScope: null, details: "" };
  });
}

export function setQuickHistoryFinding(
  responses: PaperlessHistoryResponse[],
  questionCode: PaperlessHistoryQuestionCode,
  selected: boolean,
): PaperlessHistoryResponse[] {
  return responses.map((item) => item.questionCode !== questionCode ? item : selected ? {
    ...item,
    answer: "YES",
    earScope: earRelatedCodes.has(questionCode) ? item.earScope ?? "BOTH" : null,
  } : {
    ...item,
    answer: "NO",
    earScope: null,
    details: "",
  });
}

export function setThresholdNumericValue(
  observation: AudiogramThresholdObservation,
  rawValue: string,
): AudiogramThresholdObservation {
  if (rawValue.trim() === "") {
    return { ear: observation.ear, frequencyHz: observation.frequencyHz, responseStatus: "NOT_TESTED" };
  }
  const value = Number(rawValue);
  if (observation.responseStatus === "NO_RESPONSE") {
    return { ...observation, noResponseAtDbHl: value };
  }
  return {
    ear: observation.ear,
    frequencyHz: observation.frequencyHz,
    responseStatus: "MEASURED",
    thresholdDbHl: value,
  };
}

export function toggleThresholdNoResponse(
  observation: AudiogramThresholdObservation,
): AudiogramThresholdObservation {
  if (observation.responseStatus === "NOT_TESTED") return observation;
  if (observation.responseStatus === "NO_RESPONSE") {
    return {
      ear: observation.ear,
      frequencyHz: observation.frequencyHz,
      responseStatus: "MEASURED",
      thresholdDbHl: observation.noResponseAtDbHl,
    };
  }
  return {
    ear: observation.ear,
    frequencyHz: observation.frequencyHz,
    responseStatus: "NO_RESPONSE",
    noResponseAtDbHl: observation.thresholdDbHl,
  };
}

export { FrequencyHzSchema };
