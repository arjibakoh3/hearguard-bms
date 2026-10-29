import { z } from "zod";
import type {
  HearingProtectionAssessment,
  HearingProtectionExposure,
  HearingProtectorRating,
} from "@/domain/hearing-protection";

export const HearingProtectorCatalogInputSchema = z.object({
  id: z.string().uuid().nullable(),
  organizationId: z.string().uuid(),
  manufacturer: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(120),
  protectorType: z.enum(["EARMUFF", "FOAM_EARPLUG", "OTHER_EARPLUG"]),
  nrrDb: z.number().min(0).max(60).nullable(),
  snrDb: z.number().min(0).max(60).nullable(),
  active: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
}).refine((value) => value.nrrDb !== null || value.snrDb !== null, {
  message: "ต้องระบุ NRR หรือ SNR อย่างน้อยหนึ่งค่า",
});

export type HearingProtectorCatalogInput = z.infer<
  typeof HearingProtectorCatalogInputSchema
>;

export const HearingProtectorAssignmentInputSchema = z.object({
  employeeId: z.string().uuid(),
  hearingProtectorId: z.string().uuid(),
  secondaryHearingProtectorId: z.string().uuid().nullable(),
  configuration: z.enum(["SINGLE", "DUAL_UNSUPPORTED"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).nullable(),
}).superRefine((value, context) => {
  if (value.configuration === "SINGLE" && value.secondaryHearingProtectorId) {
    context.addIssue({
      code: "custom",
      path: ["secondaryHearingProtectorId"],
      message: "การใช้อุปกรณ์ชิ้นเดียวต้องไม่มีอุปกรณ์ชิ้นที่สอง",
    });
  }
  if (value.configuration === "DUAL_UNSUPPORTED" && !value.secondaryHearingProtectorId) {
    context.addIssue({
      code: "custom",
      path: ["secondaryHearingProtectorId"],
      message: "การใช้ปลั๊กพร้อมครอบหูต้องระบุอุปกรณ์ทั้งสองชิ้น",
    });
  }
});

export type HearingProtectorAssignmentInput = z.infer<
  typeof HearingProtectorAssignmentInputSchema
>;

export type HearingProtectionExposureContext = HearingProtectionExposure & {
  measurementDate: string;
  scope: "EMPLOYEE" | "DEPARTMENT";
};

export type HearingProtectionEmployeeContext = {
  employeeId: string;
  organizationId: string;
  exposure: HearingProtectionExposureContext | null;
  protectors: HearingProtectorRating[];
};

export type PersistHearingProtectionAssignment = {
  input: HearingProtectorAssignmentInput;
  organizationId: string;
  exposureId: string | null;
  assessment: HearingProtectionAssessment;
  inputSnapshot: Record<string, unknown>;
};
