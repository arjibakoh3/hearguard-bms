import type {
  AudiogramThreshold,
  Ear,
  FrequencyHz,
  NioshConfirmationEvidence,
  NioshPersistenceAnalysis,
} from "@/domain/hearing";
import type {
  HearingProtectionCalculation,
  HearingProtectionMethod,
  HearingProtectionStatus,
  HearingProtectorType,
  NoiseExposureBasis,
} from "@/domain/hearing-protection";
import type { NihlPhysicianReview } from "./nihl-evidence-models";

export type ClinicalResultStatus = "positive" | "negative" | "not_evaluable";

export type FollowUpCaseStatus =
  | "SHIFT_DETECTED"
  | "REPEAT_REQUIRED"
  | "REPEAT_COMPLETED"
  | "PHYSICIAN_REVIEW"
  | "INTERVENTION_REQUIRED"
  | "FOLLOW_UP"
  | "CLOSED";

export type WorkflowDisplayStage =
  | "REPEAT_REQUIRED"
  | "PHYSICIAN_REVIEW"
  | "INTERVENTION_REQUIRED"
  | "FOLLOW_UP"
  | "CLOSED";

export type ClinicalResultFilter = ClinicalResultStatus | "no_evaluation";
export type FollowUpWorkflowFilter = WorkflowDisplayStage | "NO_CASE";

export type OrganizationListItem = {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  active: boolean;
  departmentCount: number;
  activeEmployeeCount: number;
  latestAudiogramDate: string | null;
};

export type DepartmentSummary = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  activeEmployeeCount: number;
  latestExposureDate: string | null;
  latestTwaDbA: number | null;
  latestPeakDb: number | null;
};

export type EmployeeListItem = {
  id: string;
  organizationId: string;
  departmentId: string | null;
  employeeNumber: string;
  fullName: string;
  jobTitle: string | null;
  organizationName: string;
  departmentName: string | null;
  latestAudiogramDate: string | null;
  latestThaiEvaluationStatus: ClinicalResultStatus | null;
  followUpStatus: FollowUpCaseStatus | null;
  repeatDueDate: string | null;
  nextAction: string;
};

export type OrganizationDetail = OrganizationListItem & {
  departments: DepartmentSummary[];
  recentEmployees: EmployeeListItem[];
};

export type PopulationSurveillanceMetrics = {
  surveillanceYear: number;
  workersUnderSurveillance: number;
  workersWithNoiseExposure: number;
  audiogramsCompleted: number;
  audiometryCompletionPct: number;
  evaluableWorkers: number;
  notEvaluableWorkers: number;
  thresholdShifts: number;
  shiftPrevalencePct: number;
  awaitingRepeat: number;
  awaitingPhysicianReview: number;
  interventionRequired: number;
  followUpRequired: number;
  outstandingFollowUp: number;
  repeatOverdue: number;
  casesClosed: number;
};

export type OrganizationPopulationSummary = PopulationSurveillanceMetrics & {
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  organizationNameTh: string | null;
};

export type DepartmentPopulationSummary = PopulationSurveillanceMetrics & {
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  organizationShiftPrevalencePct: number;
  potentialDeteriorationCluster: boolean;
};

export type PopulationDashboard = {
  totals: PopulationSurveillanceMetrics;
  organizations: OrganizationPopulationSummary[];
  attentionDepartments: DepartmentPopulationSummary[];
};

export type OrganizationAnalytics = {
  summary: OrganizationPopulationSummary;
  departments: DepartmentPopulationSummary[];
};

export type DirectoryOption = {
  id: string;
  label: string;
  organizationId?: string;
};

export type EmployeeSearchCriteria = {
  query?: string;
  organizationId?: string;
  departmentId?: string;
  clinicalResult?: ClinicalResultFilter;
  followUpWorkflow?: FollowUpWorkflowFilter;
  page: number;
  pageSize: number;
};

export type EmployeeSearchResult = {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
  organizations: DirectoryOption[];
  departments: DirectoryOption[];
};

export type AudiogramListItem = {
  id: string;
  employeeId: string;
  organizationId: string;
  employeeNumber: string;
  employeeName: string;
  organizationName: string;
  departmentName: string | null;
  examDate: string;
  examType: "BASELINE" | "ANNUAL" | "REPEAT" | "CONFIRMATION" | "OTHER";
  isValid: boolean;
  validationNotes: string | null;
  thresholdCount: number;
};

export type AudiogramSearchCriteria = {
  query?: string;
  organizationId?: string;
  examType?: AudiogramListItem["examType"];
  year?: number;
  page: number;
  pageSize: number;
};

export type AudiogramSearchResult = {
  items: AudiogramListItem[];
  total: number;
  page: number;
  pageSize: number;
  organizations: DirectoryOption[];
  availableYears: number[];
};

export type EmployeeIdentity = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  sex: string | null;
  dateOfBirth: string | null;
  jobTitle: string | null;
  employmentStartDate: string | null;
  active: boolean;
  organizationId: string;
  organizationName: string;
  departmentId: string | null;
  departmentName: string | null;
  patientId?: string;
  hospitalNumber?: string;
};

export type ProfileAudiogram = {
  id: string;
  examDate: string;
  examinedAt: string;
  examType: AudiogramListItem["examType"];
  sourceMonitoringAudiogramId: string | null;
  hoursSinceNoiseExposure: number | null;
  confirmationEvidence: NioshConfirmationEvidence | null;
  isValid: boolean;
  validationNotes: string | null;
  isActiveBaseline: boolean;
  clinicalResult: ClinicalResultStatus | null;
  thresholds: AudiogramThreshold[];
  thresholdObservations: Array<
    | (AudiogramThreshold & { responseStatus: "MEASURED" })
    | { ear: Ear; frequencyHz: FrequencyHz; responseStatus: "NO_RESPONSE"; noResponseAtDbHl: number }
    | { ear: Ear; frequencyHz: FrequencyHz; responseStatus: "NOT_TESTED" }
  >;
};

export type ActiveBaselineSummary = {
  historyId: string;
  audiogramId: string;
  examDate: string;
  reasonCode: string;
  effectiveFrom: string;
} | null;

export type NoiseExposureSummary = {
  id: string;
  measurementDate: string;
  scope: "EMPLOYEE" | "DEPARTMENT";
  twaDbA: number | null;
  twaDbC: number | null;
  lelDbA: number | null;
  peakDb: number | null;
  shiftHours: number | null;
  measurementMethod: string | null;
  exposureBasis: NoiseExposureBasis;
};

export type HearingProtectorSummary = {
  id: string;
  organizationId: string;
  manufacturer: string;
  model: string;
  protectorType: HearingProtectorType;
  nrrDb: number | null;
  snrDb: number | null;
  active: boolean;
  notes: string | null;
};

export type HearingProtectorAssignmentSummary = {
  id: string;
  configuration: "SINGLE" | "DUAL_UNSUPPORTED";
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  protector: HearingProtectorSummary;
  secondaryProtector: HearingProtectorSummary | null;
} | null;

export type HearingProtectionAssessmentSummary = {
  id: string;
  assignmentId: string;
  noiseExposureId: string | null;
  status: HearingProtectionStatus;
  protectedExposureDbA: number | null;
  allowableExposureDbA: number | null;
  protectionMarginDb: number | null;
  governingMethod: HearingProtectionMethod | null;
  ruleCode: string;
  ruleVersion: string;
  calculations: HearingProtectionCalculation[];
  reasons: string[];
  assessedAt: string;
  exposureSnapshot: {
    id: string | null;
    measurementDate: string;
    scope: "EMPLOYEE" | "DEPARTMENT";
    levelDbA: number | null;
    levelDbC: number | null;
    shiftHours: number | null;
    basis: NoiseExposureBasis;
  } | null;
} | null;

export type EmployeeHearingProtectionSummary = {
  availableProtectors: HearingProtectorSummary[];
  currentAssignment: HearingProtectorAssignmentSummary;
  latestAssessment: HearingProtectionAssessmentSummary;
};

export type EvaluationSummary = {
  id: string;
  currentAudiogramId: string;
  baselineAudiogramId: string | null;
  status: ClinicalResultStatus;
  ruleCode: string;
  ruleName: string;
  ruleVersion: string;
  findingCount: number;
  findings: Array<{
    ear: Ear;
    frequenciesHz: FrequencyHz[];
    baselineDbHl: number;
    currentDbHl: number;
    differenceDb: number;
    criterion: string;
  }>;
  earAverages: Array<{
    ear: Ear;
    frequenciesHz: FrequencyHz[];
    baselineDbHl: number;
    currentDbHl: number;
    differenceDb: number;
    criterion: string;
  }>;
  notEvaluableReasons: string[];
  recommendedAction: string | null;
  explanation: string | null;
  evaluatedAt: string;
};

export type FollowUpSummary = {
  id: string;
  status: FollowUpCaseStatus;
  detectedDate: string;
  repeatDueDate: string | null;
  repeatCompletedDate: string | null;
  physicianReviewDate: string | null;
  followUpDate: string | null;
  closedDate: string | null;
} | null;

export type EmployeeProfile = {
  identity: EmployeeIdentity;
  latestThaiEvaluationStatus: ClinicalResultStatus | null;
  followUpStatus: FollowUpCaseStatus | null;
  nextAction: string;
  activeBaseline: ActiveBaselineSummary;
  audiograms: ProfileAudiogram[];
  evaluations: EvaluationSummary[];
  nioshAnalysis: NioshPersistenceAnalysis | null;
  latestFollowUp: FollowUpSummary;
  noiseExposures: NoiseExposureSummary[];
  hearingProtection: EmployeeHearingProtectionSummary;
};

export type ReportImportantHearingCondition = {
  id: string;
  category:
    | "PRE_EXISTING_HEARING_LOSS"
    | "PRE_EXISTING_HEARING_DISABILITY"
    | "OTHER_IMPORTANT_HEARING_HISTORY";
  earScope: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN";
  onset: "CONGENITAL_OR_CHILDHOOD" | "LATER" | "UNKNOWN";
  source: "PATIENT_OR_FAMILY" | "PRIOR_MEDICAL_RECORD" | "PHYSICIAN_CONFIRMED";
  details: string;
};

export type ReportNihlReview = Pick<NihlPhysicianReview, "decision" | "reviewNote" | "reviewedAt" | "amendedAt"> & {
  identityScope: "HN_LINKED" | "EMPLOYEE_ONLY";
};

export type EmployeeAudiogramReport = {
  identity: EmployeeIdentity;
  selectedAudiogram: ProfileAudiogram;
  baselineAudiogram: ProfileAudiogram | null;
  evaluations: EvaluationSummary[];
  relatedFollowUp: FollowUpSummary;
  importantHearingHistory: ReportImportantHearingCondition[] | null;
  nihlReview: ReportNihlReview | null;
  referralScreening: import("@/domain/hearing/rules/aao-hns-referral").AaoHnsReferralAssessment;
  originalBaselineReferralScreening: import("@/domain/hearing/rules/aao-hns-referral").AaoHnsReferralAssessment | null;
  generatedAt: string;
};

export type ThresholdPoint = {
  ear: Ear;
  frequencyHz: FrequencyHz;
  thresholdDbHl: number;
};

export type FollowUpQueueFilter =
  | "ALL_OPEN"
  | "REPEAT_REQUIRED"
  | "OVERDUE"
  | "DUE_SOON"
  | "PHYSICIAN_REVIEW"
  | "INTERVENTION_REQUIRED"
  | "FOLLOW_UP"
  | "CLOSED";

export type FollowUpCaseListItem = {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  organizationName: string;
  departmentName: string | null;
  ruleCode: string;
  ruleName: string;
  ruleVersion: string;
  trigger: string;
  clinicalResult: ClinicalResultStatus | null;
  status: FollowUpCaseStatus;
  workflowStage: WorkflowDisplayStage;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" | null;
  detectedDate: string;
  repeatDueDate: string | null;
  assignedTo: string | null;
  isOverdue: boolean;
  historicalImport: boolean;
};

export type FollowUpSearchCriteria = {
  query?: string;
  organizationId?: string;
  filter: FollowUpQueueFilter;
  page: number;
  pageSize: number;
};

export type FollowUpSearchResult = {
  items: FollowUpCaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  organizations: DirectoryOption[];
  counts: {
    allOpen: number;
    repeatRequired: number;
    overdue: number;
    dueSoon: number;
    physicianReview: number;
    interventionRequired: number;
    followUp: number;
  };
};

export type FollowUpAuditEvent = {
  id: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  createdAt: string;
};

export type FollowUpCaseDetail = FollowUpCaseListItem & {
  triggerEvaluationId: string;
  evaluation: EvaluationSummary;
  repeatCompletedDate: string | null;
  physicianReviewDate: string | null;
  interventionRequired: boolean;
  interventionNotes: string | null;
  followUpDate: string | null;
  closedDate: string | null;
  allowedNextStatuses: FollowUpCaseStatus[];
  auditTrail: FollowUpAuditEvent[];
};

export type AuditLogSearchCriteria = {
  query?: string;
  organizationId?: string;
  action?: string;
  entityType?: string;
  page: number;
  pageSize: number;
};

export type AuditLogListItem = {
  id: string;
  organizationId: string | null;
  organizationCode: string | null;
  organizationName: string | null;
  organizationNameTh: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: "HOSPITAL_ADMIN" | "OCCUPATIONAL_HEALTH_STAFF" | "OCCUPATIONAL_PHYSICIAN" | "COMPANY_USER" | null;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: string;
};

export type AuditLogDetail = AuditLogListItem & {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

export type AuditLogSearchResult = {
  items: AuditLogListItem[];
  total: number;
  page: number;
  pageSize: number;
  organizations: DirectoryOption[];
  actions: string[];
  entityTypes: string[];
};

export type BaselineSuggestionType =
  | "THAI_INITIAL_BASELINE_CANDIDATE"
  | "CURRENT_BASELINE_CONFIRMED"
  | "OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS"
  | "OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT"
  | "NIOSH_PERSISTENT_SHIFT_CONFIRMED"
  | "NIOSH_SHIFT_NOT_CONFIRMED"
  | "POSSIBLE_MEASUREMENT_VARIABILITY"
  | "INSUFFICIENT_DATA";

export type BaselineReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "DEFERRED";

export type BaselineHistoryVersion = {
  id: string;
  baselineAudiogramId: string;
  baselineDate: string;
  earScope: "LEFT" | "RIGHT" | "BOTH";
  frameworkOrContext: string;
  status: "ACTIVE" | "SUPERSEDED" | "REJECTED";
  reasonCode: string;
  reasonText: string | null;
  sourceSuggestionId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
};

export type BaselineGovernanceSearchCriteria = {
  query?: string;
  organizationId?: string;
  framework?: "THAI" | "OSHA" | "NIOSH";
  reviewStatus?: BaselineReviewStatus;
  page: number;
  pageSize: number;
};

export type BaselineGovernanceListItem = {
  id: string;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  organizationNameTh: string | null;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  framework: "THAI" | "OSHA" | "NIOSH";
  suggestionType: BaselineSuggestionType;
  qualitativeState: "REVIEW_REQUIRED" | "INSUFFICIENT_DATA" | "SUPPORTED_BY_RULE";
  earScope: "LEFT" | "RIGHT" | "BOTH";
  monitoringDate: string | null;
  confirmationDate: string | null;
  candidateDate: string | null;
  reviewStatus: BaselineReviewStatus;
  createdAt: string;
};

export type BaselineGovernanceDetail = BaselineGovernanceListItem & {
  activeBaselineHistoryId: string | null;
  activeBaselineAudiogramId: string | null;
  activeBaselineDate: string | null;
  monitoringAudiogramId: string | null;
  immediateRetestAudiogramId: string | null;
  immediateRetestDate: string | null;
  confirmationAudiogramId: string | null;
  confirmationQuietHours: number | null;
  candidateAudiogramId: string | null;
  baselineHistory: BaselineHistoryVersion[];
  evidence: Record<string, unknown>;
  explanation: string;
  requiredAction: string;
  automaticBaselineChange: false;
  thaiFollowUpMutation: false;
  createdByEmail: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
};

export type BaselineGovernanceSearchResult = {
  items: BaselineGovernanceListItem[];
  total: number;
  page: number;
  pageSize: number;
  organizations: DirectoryOption[];
  counts: Record<BaselineReviewStatus, number>;
};
