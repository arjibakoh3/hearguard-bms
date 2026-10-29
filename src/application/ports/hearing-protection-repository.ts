import type {
  HearingProtectionEmployeeContext,
  HearingProtectorCatalogInput,
  PersistHearingProtectionAssignment,
} from "../hearing-protection-models";
import type { HearingProtectorSummary } from "../view-models";

export interface HearingProtectionRepository {
  listOrganizationProtectors(
    organizationId: string,
  ): Promise<HearingProtectorSummary[]>;
  upsertProtector(input: HearingProtectorCatalogInput): Promise<string>;
  getEmployeeContext(
    employeeId: string,
  ): Promise<HearingProtectionEmployeeContext | null>;
  assignAndRecordAssessment(
    command: PersistHearingProtectionAssignment,
  ): Promise<{ assignmentId: string; assessmentId: string }>;
}
