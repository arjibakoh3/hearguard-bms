import { z } from "zod";
import type {
  NihlAlternativeContributor,
  NihlAudiogramSnapshot,
  NihlEvidenceResult,
  NoiseExposurePeriodEvidence,
} from "@/domain/hearing";

const NullableNumberSchema = z.number().finite().nullable();

export const NoiseExposureSourceInputSchema = z.object({
  noiseExposureId: z.string().uuid().nullable(),
  measurementKind: z.enum([
    "PERSONAL_DOSIMETRY",
    "AREA_MEASUREMENT",
    "REPRESENTATIVE_JOB_GROUP",
    "RECORD_REVIEW",
    "PATIENT_RECALL",
  ]),
  metric: z.enum(["LEX_8H", "LAEQ_TE", "DAILY_DOSE"]),
  levelDbA: NullableNumberSchema,
  dosePercent: NullableNumberSchema,
  measurementDurationHours: NullableNumberSchema,
  exchangeRateDb: NullableNumberSchema,
  criterionLevelDbA: NullableNumberSchema,
  measurementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  representativeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  representativeTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  quality: z.enum(["HIGH", "MODERATE", "LOW", "UNKNOWN"]),
  notes: z.string().trim().max(2000),
  verified: z.boolean(),
}).superRefine((value, context) => {
  if (value.metric === "DAILY_DOSE" && value.dosePercent === null) {
    context.addIssue({ code: "custom", path: ["dosePercent"], message: "Daily dose ต้องระบุเปอร์เซ็นต์" });
  }
  if (value.metric !== "DAILY_DOSE" && value.levelDbA === null) {
    context.addIssue({ code: "custom", path: ["levelDbA"], message: "กรุณาระบุระดับเสียง dBA" });
  }
  if (value.metric === "LAEQ_TE" && value.measurementDurationHours === null) {
    context.addIssue({ code: "custom", path: ["measurementDurationHours"], message: "LAeq,T ต้องระบุระยะเวลาตรวจวัด" });
  }
});

export const HearingProtectionInputSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  protectionType: z.string().trim().min(1).max(200),
  wearingTimePercent: z.number().min(0).max(100).nullable(),
  attenuationMethod: z.enum(["PAR", "NRR", "NONE", "UNKNOWN"]),
  attenuationDb: z.number().min(0).max(60).nullable(),
  fitTestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes: z.string().trim().max(2000),
});

export const NoiseExposurePeriodInputSchema = z.object({
  id: z.string().uuid().nullable(),
  employeeId: z.string().uuid(),
  employerName: z.string().trim().min(1).max(300),
  jobTitle: z.string().trim().max(300),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  hoursPerDay: z.number().positive().max(24).nullable(),
  daysPerWeek: z.number().positive().max(7).nullable(),
  weeksPerYear: z.number().positive().max(53).nullable(),
  exposurePattern: z.enum(["CONTINUOUS", "INTERMITTENT", "FLUCTUATING", "IMPULSE", "MIXED", "UNKNOWN"]),
  impulseNoise: z.boolean(),
  informationSource: z.enum(["MEASURED", "RECORD_REVIEW", "PATIENT_RECALL"]),
  confidence: z.enum(["HIGH", "MODERATE", "LOW", "UNKNOWN"]),
  notes: z.string().trim().max(4000),
  status: z.enum(["ACTIVE", "INACTIVE", "ENTERED_IN_ERROR"]),
  statusReason: z.string().trim().max(1000),
  sources: z.array(NoiseExposureSourceInputSchema).min(1).max(20),
  hearingProtection: z.array(HearingProtectionInputSchema).max(20),
}).superRefine((value, context) => {
  if (value.endDate && value.endDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" });
  }
  if (value.status !== "ACTIVE" && !value.statusReason) {
    context.addIssue({ code: "custom", path: ["statusReason"], message: "สถานะยกเลิกต้องระบุเหตุผล" });
  }
});

export const NihlPhysicianReviewInputSchema = z.object({
  assessmentId: z.string().uuid(),
  employeeId: z.string().uuid(),
  decision: z.enum([
    "AGREE_COMPATIBLE",
    "MIXED_OR_MULTIFACTORIAL",
    "ALTERNATIVE_CAUSE_MORE_LIKELY",
    "DEFER_NEED_MORE_DATA",
  ]),
  reviewNote: z.string().trim().min(1).max(4000),
});

export type NoiseExposurePeriodInput = z.infer<typeof NoiseExposurePeriodInputSchema>;
export type NihlPhysicianReviewInput = z.infer<typeof NihlPhysicianReviewInputSchema>;

export const NihlReviewAmendmentInputSchema = NihlPhysicianReviewInputSchema.omit({ assessmentId: true }).extend({
  reviewId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
});
export type NihlReviewAmendmentInput = z.infer<typeof NihlReviewAmendmentInputSchema>;
export type NihlReviewAmendmentResult = { reviewId: string; audiogramId: string; revision: number };
export type NihlReviewAmendmentState = { error: string | null; conflict: boolean; saved?: boolean };
export class NihlReviewConflictError extends Error {
  constructor() { super("รีวิวนี้มีการเปลี่ยนแปลงแล้ว กรุณาโหลดรีวิวล่าสุดก่อนบันทึกอีกครั้ง"); }
}
export type NihlReviewRevision = {
  revision: number;
  decision: NihlPhysicianReviewInput["decision"];
  reviewNote: string;
  recordedBy: string;
  recordedAt: string;
};

export type NihlPhysicianReview = {
  id: string;
  decision: NihlPhysicianReviewInput["decision"];
  reviewNote: string;
  reviewedBy: string;
  reviewedAt: string;
  revision: number;
  amendedAt: string | null;
  revisions: NihlReviewRevision[];
};

export type NihlPersistedAssessment = {
  id: string;
  currentAudiogramId: string;
  state: NihlEvidenceResult["state"];
  completeness: NihlEvidenceResult["completeness"];
  result: NihlEvidenceResult;
  createdAt: string;
  review: NihlPhysicianReview | null;
};

export type NihlEvidenceWorkspace = {
  identity: {
    employeeId: string;
    patientId: string | null;
    hospitalNumber: string | null;
    identityScope: "HN_LINKED" | "EMPLOYEE_ONLY";
    employeeNumber: string;
    fullName: string;
    organizationId: string;
    organizationName: string;
    jobTitle: string | null;
  };
  exposurePeriods: NoiseExposurePeriodEvidence[];
  audiograms: NihlAudiogramSnapshot[];
  currentAudiogram: NihlAudiogramSnapshot | null;
  alternativeContributors: NihlAlternativeContributor[];
  accessLimited: boolean;
  latestAssessment: NihlPersistedAssessment | null;
  assessmentHistory: NihlPersistedAssessment[];
};
