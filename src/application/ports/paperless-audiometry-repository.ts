import type { HearingRuleEvaluation } from "@/domain/hearing/types/evaluation";
import type { OshaStsEvaluation } from "@/domain/hearing/rules/osha-sts";
import type {
  PaperlessAudiogramInput,
  PaperlessAudiogramRecord,
  PaperlessWorkspace,
  HospitalPatientEmploymentSummary,
  HospitalPatientTimeline,
  ImportantHearingHistoryState,
  PendingEmploymentTransition,
  PriorHistorySnapshot,
  RegisterHospitalEmployeeInput,
  RegisterHospitalOrganizationInput,
  UpsertHospitalAudiometerInput,
  ManageImportantHearingConditionInput,
} from "../paperless-audiometry-models";

export interface PaperlessAudiometryRepository {
  getWorkspace(): Promise<PaperlessWorkspace>;
  getRecord(id: string): Promise<PaperlessAudiogramRecord | null>;
  lookupPatientEmployments(hospitalNumber: string): Promise<HospitalPatientEmploymentSummary | null>;
  getPatientTimeline(patientId: string): Promise<HospitalPatientTimeline | null>;
  getImportantHearingHistory(employeeId: string): Promise<ImportantHearingHistoryState | null>;
  listPendingEmploymentTransitions(): Promise<PendingEmploymentTransition[]>;
  getPriorHistorySnapshot(input: {
    employeeId: string;
    examType: PaperlessAudiogramInput["examType"];
    sourceMonitoringAudiogramId: string | null;
    examinedAt: string;
  }): Promise<PriorHistorySnapshot | null>;
  registerEmployee(input: RegisterHospitalEmployeeInput): Promise<string>;
  registerOrganization(input: RegisterHospitalOrganizationInput): Promise<{ organizationId: string; code: string }>;
  upsertAudiometer(input: UpsertHospitalAudiometerInput): Promise<string>;
  manageImportantHearingCondition(input: ManageImportantHearingConditionInput): Promise<string>;
  completeEmploymentTransfer(id: string): Promise<void>;
  saveDraft(id: string | null, input: PaperlessAudiogramInput): Promise<string>;
  finalize(
    id: string,
    thaiEvaluation: HearingRuleEvaluation | null,
    oshaEvaluation: (OshaStsEvaluation & {
      ruleName: string;
      explanation: string;
      recommendedAction: string;
    }) | null,
  ): Promise<{ audiogramId: string; followUpCaseId: string | null }>;
  proposeInitialBaseline(id: string): Promise<string>;
}
