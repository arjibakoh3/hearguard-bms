import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { HearGuardReadRepository } from "@/application/ports/hearguard-read-repository";
import type {
  AudiogramListItem,
  AudiogramSearchCriteria,
  AudiogramSearchResult,
  AuditLogDetail,
  AuditLogListItem,
  AuditLogSearchCriteria,
  AuditLogSearchResult,
  BaselineGovernanceDetail,
  BaselineGovernanceListItem,
  BaselineGovernanceSearchCriteria,
  BaselineGovernanceSearchResult,
  DepartmentPopulationSummary,
  DepartmentSummary,
  DirectoryOption,
  EmployeeAudiogramReport,
  EmployeeListItem,
  EmployeeProfile,
  EmployeeSearchCriteria,
  EmployeeSearchResult,
  FollowUpCaseDetail,
  FollowUpCaseListItem,
  FollowUpCaseStatus,
  FollowUpSearchCriteria,
  FollowUpSearchResult,
  HearingProtectionAssessmentSummary,
  HearingProtectorAssignmentSummary,
  HearingProtectorSummary,
  OrganizationAnalytics,
  FollowUpSummary,
  OrganizationDetail,
  OrganizationListItem,
  OrganizationPopulationSummary,
  PopulationDashboard,
  PopulationSurveillanceMetrics,
} from "@/application/view-models";
import {
  nextActionForEmployeeStatus,
  normalizeClinicalResultStatus,
  normalizeFollowUpStatus,
  workflowDisplayStageFromStatus,
} from "@/application/employee-status";
import { getPersistedReportContext } from "@/application/audiogram-presentation";
import { buildAaoHnsReferralContext } from "@/domain/hearing/rules/aao-hns-referral";
import {
  analyzeNioshPersistence,
  calculateObservedPercentage,
  type Audiogram,
} from "@/domain/hearing";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { EvaluationRowSchema, mapEvaluation } from "./evaluation-summary-mapper";
import { loadReportNihlReview } from "./report-nihl-review";

const DatabaseNumberSchema = z.union([
  z.number(),
  z.string().transform((value) => Number(value)),
]);
const NullableDatabaseNumberSchema = DatabaseNumberSchema.nullable();

const OrganizationDirectoryRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  name_th: z.string().nullable(),
  active: z.boolean(),
  department_count: z.number().int().nonnegative(),
  active_employee_count: z.number().int().nonnegative(),
  latest_audiogram_date: z.string().nullable(),
});

const DepartmentDirectoryRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  active_employee_count: z.number().int().nonnegative(),
  latest_exposure_date: z.string().nullable(),
  latest_twa_db_a: NullableDatabaseNumberSchema,
  latest_peak_db: NullableDatabaseNumberSchema,
});

const EmployeeDirectoryRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  department_id: z.string().uuid().nullable(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  job_title: z.string().nullable(),
  active: z.boolean(),
  organization_name: z.string(),
  organization_code: z.string(),
  department_name: z.string().nullable(),
  latest_audiogram_date: z.string().nullable(),
  latest_evaluation_status: z.string().nullable(),
  follow_up_status: z.string().nullable(),
  repeat_due_date: z.string().nullable(),
});

const AudiogramDirectoryRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  exam_date: z.string(),
  exam_type: z.enum(["BASELINE", "ANNUAL", "REPEAT", "CONFIRMATION", "OTHER"]),
  is_valid: z.boolean(),
  validation_notes: z.string().nullable(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  department_id: z.string().uuid().nullable(),
  organization_name: z.string(),
  department_name: z.string().nullable(),
  threshold_count: z.number().int().nonnegative(),
});

const PopulationMetricFields = {
  surveillance_year: z.number().int(),
  workers_under_surveillance: z.number().int().nonnegative(),
  workers_with_noise_exposure: z.number().int().nonnegative(),
  audiograms_completed: z.number().int().nonnegative(),
  audiometry_completion_pct: DatabaseNumberSchema.nullable(),
  evaluable_workers: z.number().int().nonnegative(),
  not_evaluable_workers: z.number().int().nonnegative(),
  threshold_shifts: z.number().int().nonnegative(),
  shift_prevalence_pct: DatabaseNumberSchema.nullable(),
  awaiting_repeat: z.number().int().nonnegative(),
  awaiting_physician_review: z.number().int().nonnegative(),
  intervention_required: z.number().int().nonnegative(),
  follow_up_required: z.number().int().nonnegative(),
  outstanding_follow_up: z.number().int().nonnegative(),
  repeat_overdue: z.number().int().nonnegative(),
  cases_closed: z.number().int().nonnegative(),
};

const OrganizationPopulationRowSchema = z.object({
  organization_id: z.string().uuid(),
  organization_code: z.string(),
  organization_name: z.string(),
  organization_name_th: z.string().nullable(),
  ...PopulationMetricFields,
});

const DepartmentPopulationRowSchema = z.object({
  organization_id: z.string().uuid(),
  organization_code: z.string(),
  organization_name: z.string(),
  department_id: z.string().uuid(),
  department_code: z.string(),
  department_name: z.string(),
  organization_shift_prevalence_pct: DatabaseNumberSchema.nullable(),
  potential_deterioration_cluster: z.boolean(),
  ...PopulationMetricFields,
});

const EmployeeIdentityRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  department_id: z.string().uuid().nullable(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  sex: z.string().nullable(),
  date_of_birth: z.string().nullable(),
  job_title: z.string().nullable(),
  employment_start_date: z.string().nullable(),
  active: z.boolean(),
  patient_id: z.string().uuid().nullable(),
  hospital_patients: z.object({ hospital_number: z.string() }).nullable(),
});

const ProfileThresholdRowSchema = z.object({
  ear: z.enum(["LEFT", "RIGHT"]),
  frequency_hz: z.union([
    z.literal(500),
    z.literal(1000),
    z.literal(2000),
    z.literal(3000),
    z.literal(4000),
    z.literal(6000),
    z.literal(8000),
  ]),
  response_status: z.enum(["MEASURED", "NO_RESPONSE", "NOT_TESTED"]),
  threshold_db_hl: z.union([
    z.number(),
    z.string().transform((value) => Number(value)),
  ]).nullable(),
  no_response_at_db_hl: NullableDatabaseNumberSchema,
});

const ProfilePretestRowSchema = z.object({
  quiet_period_answer: z.enum(["YES", "NO", "UNKNOWN"]),
  quiet_period_hours: NullableDatabaseNumberSchema,
  hearing_protection_during_quiet: z.enum(["YES", "NO", "UNKNOWN"]),
  high_nonoccupational_noise: z.enum(["YES", "NO", "UNKNOWN"]),
});

const ProfileAudiogramRowSchema = z.object({
  id: z.string().uuid(),
  exam_date: z.string(),
  examined_at: z.string(),
  exam_type: z.enum(["BASELINE", "ANNUAL", "REPEAT", "CONFIRMATION", "OTHER"]),
  source_monitoring_audiogram_id: z.string().uuid().nullable(),
  hours_since_noise_exposure: NullableDatabaseNumberSchema,
  is_valid: z.boolean(),
  validation_notes: z.string().nullable(),
  audiogram_pretest_assessments: z.union([
    ProfilePretestRowSchema,
    z.array(ProfilePretestRowSchema),
  ]).nullable(),
  audiogram_thresholds: z.array(ProfileThresholdRowSchema),
});

const BaselineRowSchema = z.object({
  id: z.string().uuid(),
  baseline_audiogram_id: z.string().uuid(),
  reason_code: z.string(),
  effective_from: z.string(),
});

const FollowUpCaseStatusSchema = z.enum([
  "SHIFT_DETECTED",
  "REPEAT_REQUIRED",
  "REPEAT_COMPLETED",
  "PHYSICIAN_REVIEW",
  "INTERVENTION_REQUIRED",
  "FOLLOW_UP",
  "CLOSED",
]);

const FollowUpQueueRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  trigger_evaluation_id: z.string().uuid(),
  current_audiogram_id: z.string().uuid(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  organization_name: z.string(),
  department_name: z.string().nullable(),
  rule_code: z.string(),
  rule_name: z.string(),
  rule_version: z.string(),
  evaluation_status: z.enum(["POSITIVE", "NEGATIVE", "NOT_EVALUABLE"]),
  evaluation_result_json: z.unknown(),
  evaluated_at: z.string(),
  status: FollowUpCaseStatusSchema,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).nullable(),
  detected_date: z.string(),
  repeat_due_date: z.string().nullable(),
  repeat_completed_date: z.string().nullable(),
  physician_review_date: z.string().nullable(),
  intervention_required: z.boolean(),
  intervention_notes: z.string().nullable(),
  follow_up_date: z.string().nullable(),
  closed_date: z.string().nullable(),
  assigned_to: z.string().uuid().nullable(),
  is_overdue: z.boolean(),
  historical_import: z.boolean(),
});

const AuditRowSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  old_values_json: z.unknown().nullable(),
  new_values_json: z.unknown().nullable(),
  created_at: z.string(),
});

const AuditDirectoryRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid().nullable(),
  organization_code: z.string().nullable(),
  organization_name: z.string().nullable(),
  organization_name_th: z.string().nullable(),
  user_id: z.string().uuid().nullable(),
  actor_email: z.string().nullable(),
  actor_role: z.enum([
    "HOSPITAL_ADMIN",
    "OCCUPATIONAL_HEALTH_STAFF",
    "OCCUPATIONAL_PHYSICIAN",
    "COMPANY_USER",
  ]).nullable(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  action: z.string(),
  old_values_json: z.record(z.string(), z.unknown()).nullable(),
  new_values_json: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});

const BaselineGovernanceRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  organization_code: z.string(),
  organization_name: z.string(),
  organization_name_th: z.string().nullable(),
  employee_id: z.string().uuid(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  framework: z.enum(["THAI", "OSHA", "NIOSH"]),
  suggestion_type: z.enum([
    "THAI_INITIAL_BASELINE_CANDIDATE",
    "CURRENT_BASELINE_CONFIRMED",
    "OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS",
    "OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT",
    "NIOSH_PERSISTENT_SHIFT_CONFIRMED",
    "NIOSH_SHIFT_NOT_CONFIRMED",
    "POSSIBLE_MEASUREMENT_VARIABILITY",
    "INSUFFICIENT_DATA",
  ]),
  qualitative_state: z.enum(["REVIEW_REQUIRED", "INSUFFICIENT_DATA", "SUPPORTED_BY_RULE"]),
  ear_scope: z.enum(["LEFT", "RIGHT", "BOTH"]),
  active_baseline_history_id: z.string().uuid().nullable(),
  active_baseline_audiogram_id: z.string().uuid().nullable(),
  active_baseline_date: z.string().nullable(),
  monitoring_audiogram_id: z.string().uuid().nullable(),
  monitoring_date: z.string().nullable(),
  immediate_retest_audiogram_id: z.string().uuid().nullable(),
  immediate_retest_date: z.string().nullable(),
  confirmation_audiogram_id: z.string().uuid().nullable(),
  confirmation_date: z.string().nullable(),
  confirmation_quiet_hours: NullableDatabaseNumberSchema,
  candidate_audiogram_id: z.string().uuid().nullable(),
  candidate_date: z.string().nullable(),
  baseline_history_json: z.array(z.object({
    id: z.string().uuid(),
    baselineAudiogramId: z.string().uuid(),
    baselineDate: z.string(),
    earScope: z.enum(["LEFT", "RIGHT", "BOTH"]),
    frameworkOrContext: z.string(),
    status: z.enum(["ACTIVE", "SUPERSEDED", "REJECTED"]),
    reasonCode: z.string(),
    reasonText: z.string().nullable(),
    sourceSuggestionId: z.string().uuid().nullable(),
    approvedBy: z.string().uuid().nullable(),
    approvedAt: z.string().nullable(),
    effectiveFrom: z.string(),
    effectiveTo: z.string().nullable(),
    createdAt: z.string(),
  })),
  evidence_json: z.record(z.string(), z.unknown()),
  explanation: z.string(),
  required_action: z.string(),
  automatic_baseline_change: z.literal(false),
  thai_follow_up_mutation: z.literal(false),
  review_status: z.enum(["PENDING", "APPROVED", "REJECTED", "DEFERRED"]),
  created_by: z.string().uuid().nullable(),
  created_by_email: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_by_email: z.string().nullable(),
  reviewed_at: z.string().nullable(),
  review_note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const FollowUpRowSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  detected_date: z.string(),
  repeat_due_date: z.string().nullable(),
  repeat_completed_date: z.string().nullable(),
  physician_review_date: z.string().nullable(),
  follow_up_date: z.string().nullable(),
  closed_date: z.string().nullable(),
});

const ReportImportantHearingConditionRowSchema = z.object({
  id: z.string().uuid(),
  category: z.enum([
    "PRE_EXISTING_HEARING_LOSS",
    "PRE_EXISTING_HEARING_DISABILITY",
    "OTHER_IMPORTANT_HEARING_HISTORY",
  ]),
  ear_scope: z.enum(["LEFT", "RIGHT", "BOTH", "UNKNOWN"]),
  onset: z.enum(["CONGENITAL_OR_CHILDHOOD", "LATER", "UNKNOWN"]),
  information_source: z.enum([
    "PATIENT_OR_FAMILY",
    "PRIOR_MEDICAL_RECORD",
    "PHYSICIAN_CONFIRMED",
  ]),
  details: z.string().nullable(),
});

const NoiseExposureRowSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  measurement_date: z.string(),
  twa_db_a: NullableDatabaseNumberSchema,
  twa_db_c: NullableDatabaseNumberSchema,
  lel_db_a: NullableDatabaseNumberSchema,
  peak_db: NullableDatabaseNumberSchema,
  shift_hours: NullableDatabaseNumberSchema,
  measurement_method: z.string().nullable(),
  exposure_basis: z.enum(["EIGHT_HOUR_TWA", "SHIFT_AVERAGE", "UNSPECIFIED"]),
});

const HearingProtectorRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  manufacturer: z.string(),
  model: z.string(),
  protector_type: z.enum(["EARMUFF", "FOAM_EARPLUG", "OTHER_EARPLUG"]),
  nrr_db: NullableDatabaseNumberSchema,
  snr_db: NullableDatabaseNumberSchema,
  active: z.boolean(),
  notes: z.string().nullable(),
});

const HearingProtectorAssignmentRowSchema = z.object({
  id: z.string().uuid(),
  hearing_protector_id: z.string().uuid(),
  secondary_hearing_protector_id: z.string().uuid().nullable(),
  configuration: z.enum(["SINGLE", "DUAL_UNSUPPORTED"]),
  effective_from: z.string(),
  effective_to: z.string().nullable(),
  notes: z.string().nullable(),
});

const HearingProtectionCalculationRowSchema = z.object({
  method: z.enum(["THAI_NRR_DBA", "THAI_NRR_DBC", "THAI_SNR"]),
  status: z.enum(["CALCULATED", "INSUFFICIENT_DATA"]),
  measuredExposureDb: NullableDatabaseNumberSchema,
  measurementWeighting: z.enum(["A", "C"]).nullable(),
  labelledRatingDb: NullableDatabaseNumberSchema,
  ratingKind: z.enum(["NRR", "SNR"]),
  protectorType: z.enum(["EARMUFF", "FOAM_EARPLUG", "OTHER_EARPLUG"]),
  deratingFactor: NullableDatabaseNumberSchema,
  adjustedNrrDb: NullableDatabaseNumberSchema,
  weightingCorrectionDb: NullableDatabaseNumberSchema,
  effectiveAttenuationDb: NullableDatabaseNumberSchema,
  protectedExposureDbA: NullableDatabaseNumberSchema,
  formula: z.string(),
  explanation: z.string(),
});

const HearingProtectionAssessmentRowSchema = z.object({
  id: z.string().uuid(),
  assignment_id: z.string().uuid(),
  noise_exposure_id: z.string().uuid().nullable(),
  status: z.enum(["ADEQUATE", "INADEQUATE", "INSUFFICIENT_DATA", "NOT_EVALUABLE"]),
  protected_exposure_db_a: NullableDatabaseNumberSchema,
  allowable_exposure_db_a: NullableDatabaseNumberSchema,
  protection_margin_db: NullableDatabaseNumberSchema,
  governing_method: z.enum(["THAI_NRR_DBA", "THAI_NRR_DBC", "THAI_SNR"]).nullable(),
  rule_code: z.string(),
  rule_version: z.string(),
  input_snapshot_json: z.object({
    exposure: z.object({
      id: z.string().uuid().nullable(),
      measurementDate: z.string(),
      scope: z.enum(["EMPLOYEE", "DEPARTMENT"]),
      levelDbA: NullableDatabaseNumberSchema,
      levelDbC: NullableDatabaseNumberSchema,
      shiftHours: NullableDatabaseNumberSchema,
      basis: z.enum(["EIGHT_HOUR_TWA", "SHIFT_AVERAGE", "UNSPECIFIED"]),
    }).nullable(),
  }).passthrough(),
  calculations_json: z.array(HearingProtectionCalculationRowSchema),
  reasons_json: z.array(z.string()),
  assessed_at: z.string(),
});

function mapHearingProtector(
  row: z.infer<typeof HearingProtectorRowSchema>,
): HearingProtectorSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    manufacturer: row.manufacturer,
    model: row.model,
    protectorType: row.protector_type,
    nrrDb: row.nrr_db,
    snrDb: row.snr_db,
    active: row.active,
    notes: row.notes,
  };
}

type DatabaseError = { message: string } | null;

function assertNoDatabaseError(error: DatabaseError, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function mapOrganization(
  row: z.infer<typeof OrganizationDirectoryRowSchema>,
): OrganizationListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameTh: row.name_th,
    active: row.active,
    departmentCount: row.department_count,
    activeEmployeeCount: row.active_employee_count,
    latestAudiogramDate: row.latest_audiogram_date,
  };
}

function mapAuditLog(
  row: z.infer<typeof AuditDirectoryRowSchema>,
): AuditLogDetail {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationCode: row.organization_code,
    organizationName: row.organization_name,
    organizationNameTh: row.organization_name_th,
    actorId: row.user_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    oldValues: row.old_values_json,
    newValues: row.new_values_json,
    createdAt: row.created_at,
  };
}

function mapBaselineGovernance(
  row: z.infer<typeof BaselineGovernanceRowSchema>,
): BaselineGovernanceDetail {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationCode: row.organization_code,
    organizationName: row.organization_name,
    organizationNameTh: row.organization_name_th,
    employeeId: row.employee_id,
    employeeNumber: row.employee_number,
    employeeName: `${row.first_name} ${row.last_name}`,
    framework: row.framework,
    suggestionType: row.suggestion_type,
    qualitativeState: row.qualitative_state,
    earScope: row.ear_scope,
    activeBaselineHistoryId: row.active_baseline_history_id,
    activeBaselineAudiogramId: row.active_baseline_audiogram_id,
    activeBaselineDate: row.active_baseline_date,
    monitoringAudiogramId: row.monitoring_audiogram_id,
    monitoringDate: row.monitoring_date,
    immediateRetestAudiogramId: row.immediate_retest_audiogram_id,
    immediateRetestDate: row.immediate_retest_date,
    confirmationAudiogramId: row.confirmation_audiogram_id,
    confirmationDate: row.confirmation_date,
    confirmationQuietHours: row.confirmation_quiet_hours,
    candidateAudiogramId: row.candidate_audiogram_id,
    candidateDate: row.candidate_date,
    baselineHistory: row.baseline_history_json,
    evidence: row.evidence_json,
    explanation: row.explanation,
    requiredAction: row.required_action,
    automaticBaselineChange: row.automatic_baseline_change,
    thaiFollowUpMutation: row.thai_follow_up_mutation,
    reviewStatus: row.review_status,
    createdByEmail: row.created_by_email,
    reviewedByEmail: row.reviewed_by_email,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

type PopulationMetricRow = {
  surveillance_year: number;
  workers_under_surveillance: number;
  workers_with_noise_exposure: number;
  audiograms_completed: number;
  audiometry_completion_pct: number | null;
  evaluable_workers: number;
  not_evaluable_workers: number;
  threshold_shifts: number;
  shift_prevalence_pct: number | null;
  awaiting_repeat: number;
  awaiting_physician_review: number;
  intervention_required: number;
  follow_up_required: number;
  outstanding_follow_up: number;
  repeat_overdue: number;
  cases_closed: number;
};

function mapPopulationMetrics(
  row: PopulationMetricRow,
): PopulationSurveillanceMetrics {
  return {
    surveillanceYear: row.surveillance_year,
    workersUnderSurveillance: row.workers_under_surveillance,
    workersWithNoiseExposure: row.workers_with_noise_exposure,
    audiogramsCompleted: row.audiograms_completed,
    audiometryCompletionPct: row.audiometry_completion_pct ?? 0,
    evaluableWorkers: row.evaluable_workers,
    notEvaluableWorkers: row.not_evaluable_workers,
    thresholdShifts: row.threshold_shifts,
    shiftPrevalencePct: row.shift_prevalence_pct ?? 0,
    awaitingRepeat: row.awaiting_repeat,
    awaitingPhysicianReview: row.awaiting_physician_review,
    interventionRequired: row.intervention_required,
    followUpRequired: row.follow_up_required,
    outstandingFollowUp: row.outstanding_follow_up,
    repeatOverdue: row.repeat_overdue,
    casesClosed: row.cases_closed,
  };
}

function mapOrganizationPopulation(
  row: z.infer<typeof OrganizationPopulationRowSchema>,
): OrganizationPopulationSummary {
  return {
    organizationId: row.organization_id,
    organizationCode: row.organization_code,
    organizationName: row.organization_name,
    organizationNameTh: row.organization_name_th,
    ...mapPopulationMetrics(row),
  };
}

function mapDepartmentPopulation(
  row: z.infer<typeof DepartmentPopulationRowSchema>,
): DepartmentPopulationSummary {
  return {
    organizationId: row.organization_id,
    organizationCode: row.organization_code,
    organizationName: row.organization_name,
    departmentId: row.department_id,
    departmentCode: row.department_code,
    departmentName: row.department_name,
    organizationShiftPrevalencePct:
      row.organization_shift_prevalence_pct ?? 0,
    potentialDeteriorationCluster: row.potential_deterioration_cluster,
    ...mapPopulationMetrics(row),
  };
}

function aggregatePopulationMetrics(
  organizations: OrganizationPopulationSummary[],
): PopulationSurveillanceMetrics {
  const surveillanceYear =
    organizations[0]?.surveillanceYear ?? new Date().getFullYear();
  const totals = organizations.reduce(
    (result, organization) => ({
      workersUnderSurveillance:
        result.workersUnderSurveillance + organization.workersUnderSurveillance,
      workersWithNoiseExposure:
        result.workersWithNoiseExposure + organization.workersWithNoiseExposure,
      audiogramsCompleted:
        result.audiogramsCompleted + organization.audiogramsCompleted,
      evaluableWorkers: result.evaluableWorkers + organization.evaluableWorkers,
      notEvaluableWorkers:
        result.notEvaluableWorkers + organization.notEvaluableWorkers,
      thresholdShifts: result.thresholdShifts + organization.thresholdShifts,
      awaitingRepeat: result.awaitingRepeat + organization.awaitingRepeat,
      awaitingPhysicianReview:
        result.awaitingPhysicianReview + organization.awaitingPhysicianReview,
      interventionRequired:
        result.interventionRequired + organization.interventionRequired,
      followUpRequired:
        result.followUpRequired + organization.followUpRequired,
      outstandingFollowUp:
        result.outstandingFollowUp + organization.outstandingFollowUp,
      repeatOverdue: result.repeatOverdue + organization.repeatOverdue,
      casesClosed: result.casesClosed + organization.casesClosed,
    }),
    {
      workersUnderSurveillance: 0,
      workersWithNoiseExposure: 0,
      audiogramsCompleted: 0,
      evaluableWorkers: 0,
      notEvaluableWorkers: 0,
      thresholdShifts: 0,
      awaitingRepeat: 0,
      awaitingPhysicianReview: 0,
      interventionRequired: 0,
      followUpRequired: 0,
      outstandingFollowUp: 0,
      repeatOverdue: 0,
      casesClosed: 0,
    },
  );

  return {
    surveillanceYear,
    ...totals,
    audiometryCompletionPct:
      calculateObservedPercentage(
        totals.audiogramsCompleted,
        totals.workersUnderSurveillance,
      ),
    shiftPrevalencePct: calculateObservedPercentage(
      totals.thresholdShifts,
      totals.evaluableWorkers,
    ),
  };
}

function mapEmployee(
  row: z.infer<typeof EmployeeDirectoryRowSchema>,
): EmployeeListItem {
  const latestThaiEvaluationStatus = normalizeClinicalResultStatus(
    row.latest_evaluation_status,
  );
  const followUpStatus = normalizeFollowUpStatus(row.follow_up_status);

  return {
    id: row.id,
    organizationId: row.organization_id,
    departmentId: row.department_id,
    employeeNumber: row.employee_number,
    fullName: `${row.first_name} ${row.last_name}`,
    jobTitle: row.job_title,
    organizationName: row.organization_name,
    departmentName: row.department_name,
    latestAudiogramDate: row.latest_audiogram_date,
    latestThaiEvaluationStatus,
    followUpStatus,
    repeatDueDate: row.repeat_due_date,
    nextAction: nextActionForEmployeeStatus(
      latestThaiEvaluationStatus,
      followUpStatus,
    ),
  };
}

function mapAudiogram(
  row: z.infer<typeof AudiogramDirectoryRowSchema>,
): AudiogramListItem {
  return {
    id: row.id,
    employeeId: row.employee_id,
    organizationId: row.organization_id,
    employeeNumber: row.employee_number,
    employeeName: `${row.first_name} ${row.last_name}`,
    organizationName: row.organization_name,
    departmentName: row.department_name,
    examDate: row.exam_date,
    examType: row.exam_type,
    isValid: row.is_valid,
    validationNotes: row.validation_notes,
    thresholdCount: row.threshold_count,
  };
}

const FOLLOW_UP_TRANSITIONS: Record<
  FollowUpCaseStatus,
  FollowUpCaseStatus[]
> = {
  SHIFT_DETECTED: ["REPEAT_REQUIRED"],
  REPEAT_REQUIRED: ["REPEAT_COMPLETED"],
  REPEAT_COMPLETED: ["PHYSICIAN_REVIEW"],
  PHYSICIAN_REVIEW: ["INTERVENTION_REQUIRED", "FOLLOW_UP", "CLOSED"],
  INTERVENTION_REQUIRED: ["FOLLOW_UP", "CLOSED"],
  FOLLOW_UP: ["PHYSICIAN_REVIEW", "CLOSED"],
  CLOSED: [],
};

function mapFollowUpCase(
  row: z.infer<typeof FollowUpQueueRowSchema>,
): FollowUpCaseListItem {
  const evaluation = mapEvaluation({
    id: row.trigger_evaluation_id,
    current_audiogram_id: row.current_audiogram_id,
    baseline_audiogram_id: null,
    status: row.evaluation_status,
    rule_version: row.rule_version,
    evaluation_result_json: row.evaluation_result_json,
    evaluated_at: row.evaluated_at,
  });
  const firstFinding = evaluation.findings[0];
  const trigger = firstFinding
    ? `${firstFinding.ear === "RIGHT" ? "หูขวา" : "หูซ้าย"} · ${firstFinding.frequenciesHz.join("/")} Hz · +${firstFinding.differenceDb} dB`
    : row.rule_name;

  return {
    id: row.id,
    organizationId: row.organization_id,
    employeeId: row.employee_id,
    employeeNumber: row.employee_number,
    employeeName: `${row.first_name} ${row.last_name}`,
    organizationName: row.organization_name,
    departmentName: row.department_name,
    ruleCode: row.rule_code,
    ruleName: row.rule_name,
    ruleVersion: row.rule_version,
    trigger,
    clinicalResult: evaluation.ruleCode === "THAI_HEARING_2561"
      ? evaluation.status
      : null,
    status: row.status,
    workflowStage: workflowDisplayStageFromStatus(row.status),
    priority: row.priority,
    detectedDate: row.detected_date,
    repeatDueDate: row.repeat_due_date,
    assignedTo: row.assigned_to,
    isOverdue: row.is_overdue,
    historicalImport: row.historical_import,
  };
}

async function loadDirectoryOptions(client: SupabaseClient) {
  const [organizationsResponse, departmentsResponse] = await Promise.all([
    client
      .from("organization_directory")
      .select("id,name")
      .eq("active", true)
      .order("name"),
    client
      .from("department_directory")
      .select("id,organization_id,name")
      .eq("active", true)
      .order("name"),
  ]);

  assertNoDatabaseError(
    organizationsResponse.error,
    "Unable to load organization filters",
  );
  assertNoDatabaseError(
    departmentsResponse.error,
    "Unable to load department filters",
  );

  const organizations = z
    .array(z.object({ id: z.string().uuid(), name: z.string() }))
    .parse(organizationsResponse.data ?? [])
    .map((row): DirectoryOption => ({ id: row.id, label: row.name }));
  const departments = z
    .array(
      z.object({
        id: z.string().uuid(),
        organization_id: z.string().uuid(),
        name: z.string(),
      }),
    )
    .parse(departmentsResponse.data ?? [])
    .map(
      (row): DirectoryOption => ({
        id: row.id,
        label: row.name,
        organizationId: row.organization_id,
      }),
    );

  return { organizations, departments };
}

export class SupabaseHearGuardReadRepository
  implements HearGuardReadRepository
{
  async listOrganizations(): Promise<OrganizationListItem[]> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("organization_directory")
      .select("*")
      .order("name");

    assertNoDatabaseError(response.error, "Unable to load organizations");

    return z
      .array(OrganizationDirectoryRowSchema)
      .parse(response.data ?? [])
      .map(mapOrganization);
  }

  async getOrganization(id: string): Promise<OrganizationDetail | null> {
    const client = await createSupabaseServerClient();
    const [organizationResponse, departmentsResponse, employeesResponse] =
      await Promise.all([
        client
          .from("organization_directory")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
        client
          .from("department_directory")
          .select("*")
          .eq("organization_id", id)
          .order("name"),
        client
          .from("employee_directory")
          .select("*")
          .eq("organization_id", id)
          .eq("active", true)
          .order("employee_number")
          .limit(8),
      ]);

    assertNoDatabaseError(
      organizationResponse.error,
      "Unable to load organization",
    );
    assertNoDatabaseError(
      departmentsResponse.error,
      "Unable to load organization departments",
    );
    assertNoDatabaseError(
      employeesResponse.error,
      "Unable to load organization employees",
    );

    if (!organizationResponse.data) {
      return null;
    }

    const organization = mapOrganization(
      OrganizationDirectoryRowSchema.parse(organizationResponse.data),
    );
    const departments: DepartmentSummary[] = z
      .array(DepartmentDirectoryRowSchema)
      .parse(departmentsResponse.data ?? [])
      .map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        active: row.active,
        activeEmployeeCount: row.active_employee_count,
        latestExposureDate: row.latest_exposure_date,
        latestTwaDbA: row.latest_twa_db_a,
        latestPeakDb: row.latest_peak_db,
      }));
    const recentEmployees = z
      .array(EmployeeDirectoryRowSchema)
      .parse(employeesResponse.data ?? [])
      .map(mapEmployee);

    return { ...organization, departments, recentEmployees };
  }

  async searchEmployees(
    criteria: EmployeeSearchCriteria,
  ): Promise<EmployeeSearchResult> {
    const client = await createSupabaseServerClient();
    const firstRow = (criteria.page - 1) * criteria.pageSize;
    const lastRow = firstRow + criteria.pageSize - 1;
    let query = client
      .from("employee_directory")
      .select("*", { count: "exact" })
      .eq("active", true)
      .order("employee_number")
      .range(firstRow, lastRow);

    if (criteria.query) {
      const search = `%${criteria.query}%`;
      query = query.or(
        `employee_number.ilike.${search},first_name.ilike.${search},last_name.ilike.${search}`,
      );
    }

    if (criteria.organizationId) {
      query = query.eq("organization_id", criteria.organizationId);
    }

    if (criteria.departmentId) {
      query = query.eq("department_id", criteria.departmentId);
    }

    if (criteria.clinicalResult === "no_evaluation") {
      query = query.is("latest_evaluation_status", null);
    } else if (criteria.clinicalResult) {
      query = query.eq("latest_evaluation_status", criteria.clinicalResult.toUpperCase());
    }

    if (criteria.followUpWorkflow === "NO_CASE") {
      query = query.is("follow_up_status", null);
    } else if (criteria.followUpWorkflow === "REPEAT_REQUIRED") {
      query = query.in("follow_up_status", ["SHIFT_DETECTED", "REPEAT_REQUIRED"]);
    } else if (criteria.followUpWorkflow === "PHYSICIAN_REVIEW") {
      query = query.in("follow_up_status", ["REPEAT_COMPLETED", "PHYSICIAN_REVIEW"]);
    } else if (criteria.followUpWorkflow) {
      query = query.eq("follow_up_status", criteria.followUpWorkflow);
    }

    const [employeesResponse, options] = await Promise.all([
      query,
      loadDirectoryOptions(client),
    ]);

    assertNoDatabaseError(employeesResponse.error, "Unable to search employees");

    const items = z
      .array(EmployeeDirectoryRowSchema)
      .parse(employeesResponse.data ?? [])
      .map(mapEmployee);

    return {
      items,
      total: employeesResponse.count ?? 0,
      page: criteria.page,
      pageSize: criteria.pageSize,
      organizations: options.organizations,
      departments: options.departments,
    };
  }

  async getEmployeeProfile(id: string): Promise<EmployeeProfile | null> {
    const client = await createSupabaseServerClient();
    const identityResponse = await client
      .from("employees")
      .select(
        "id,organization_id,department_id,employee_number,first_name,last_name,sex,date_of_birth,job_title,employment_start_date,active,patient_id,hospital_patients(hospital_number)",
      )
      .eq("id", id)
      .maybeSingle();

    assertNoDatabaseError(identityResponse.error, "Unable to load employee");

    if (!identityResponse.data) {
      return null;
    }

    const identityRow = EmployeeIdentityRowSchema.parse(identityResponse.data);
    let noiseQuery = client
      .from("noise_exposures")
      .select(
        "id,employee_id,measurement_date,twa_db_a,twa_db_c,lel_db_a,peak_db,shift_hours,measurement_method,exposure_basis",
      )
      .eq("organization_id", identityRow.organization_id)
      .order("measurement_date", { ascending: false });

    if (identityRow.department_id) {
      noiseQuery = noiseQuery.or(
        `employee_id.eq.${identityRow.id},and(employee_id.is.null,department_id.eq.${identityRow.department_id})`,
      );
    } else {
      noiseQuery = noiseQuery.eq("employee_id", identityRow.id);
    }

    const today = new Date().toISOString().slice(0, 10);
    const [
      organizationResponse,
      departmentResponse,
      directoryResponse,
      audiogramsResponse,
      baselineResponse,
      evaluationsResponse,
      followUpResponse,
      noiseResponse,
      protectorsResponse,
      protectorAssignmentResponse,
      hearingProtectionAssessmentResponse,
    ] = await Promise.all([
      client
        .from("organizations")
        .select("name")
        .eq("id", identityRow.organization_id)
        .single(),
      identityRow.department_id
        ? client
            .from("departments")
            .select("name")
            .eq("id", identityRow.department_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      client
        .from("employee_directory")
        .select("*")
        .eq("id", identityRow.id)
        .single(),
      client
        .from("audiograms")
        .select(
          "id,exam_date,examined_at,exam_type,source_monitoring_audiogram_id,hours_since_noise_exposure,is_valid,validation_notes,audiogram_pretest_assessments!audiogram_pretest_same_scope(quiet_period_answer,quiet_period_hours,hearing_protection_during_quiet,high_nonoccupational_noise),audiogram_thresholds(ear,frequency_hz,response_status,threshold_db_hl,no_response_at_db_hl)",
        )
        .eq("employee_id", identityRow.id)
        .eq("record_status", "FINAL")
        .order("examined_at", { ascending: true }),
      client
        .from("hearing_baseline_history")
        .select("id,baseline_audiogram_id,reason_code,effective_from")
        .eq("employee_id", identityRow.id)
        .eq("status", "ACTIVE")
        .eq("framework_or_context", "THAI_OPERATIONAL")
        .limit(1)
        .maybeSingle(),
      client
        .from("surveillance_evaluations")
        .select(
          "id,current_audiogram_id,baseline_audiogram_id,status,rule_version,evaluation_result_json,evaluated_at",
        )
        .eq("employee_id", identityRow.id)
        .order("evaluated_at", { ascending: false }),
      client
        .from("follow_up_cases")
        .select(
          "id,status,detected_date,repeat_due_date,repeat_completed_date,physician_review_date,follow_up_date,closed_date",
        )
        .eq("employee_id", identityRow.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      noiseQuery,
      client
        .from("hearing_protectors")
        .select("id,organization_id,manufacturer,model,protector_type,nrr_db,snr_db,active,notes")
        .eq("organization_id", identityRow.organization_id)
        .order("manufacturer")
        .order("model"),
      client
        .from("employee_hearing_protector_assignments")
        .select("id,hearing_protector_id,secondary_hearing_protector_id,configuration,effective_from,effective_to,notes")
        .eq("employee_id", identityRow.id)
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("hearing_protection_assessments")
        .select("id,assignment_id,noise_exposure_id,status,protected_exposure_db_a,allowable_exposure_db_a,protection_margin_db,governing_method,rule_code,rule_version,input_snapshot_json,calculations_json,reasons_json,assessed_at")
        .eq("employee_id", identityRow.id)
        .order("assessed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    assertNoDatabaseError(
      organizationResponse.error,
      "Unable to load employee organization",
    );
    assertNoDatabaseError(
      departmentResponse.error,
      "Unable to load employee department",
    );
    assertNoDatabaseError(
      directoryResponse.error,
      "Unable to load employee surveillance state",
    );
    assertNoDatabaseError(
      audiogramsResponse.error,
      "Unable to load employee audiograms",
    );
    assertNoDatabaseError(
      baselineResponse.error,
      "Unable to load employee baseline",
    );
    assertNoDatabaseError(
      evaluationsResponse.error,
      "Unable to load employee evaluations",
    );
    assertNoDatabaseError(
      followUpResponse.error,
      "Unable to load employee follow-up case",
    );
    assertNoDatabaseError(
      noiseResponse.error,
      "Unable to load employee noise exposure",
    );
    assertNoDatabaseError(
      protectorsResponse.error,
      "Unable to load employee hearing protector catalog",
    );
    assertNoDatabaseError(
      protectorAssignmentResponse.error,
      "Unable to load employee hearing protector assignment",
    );
    assertNoDatabaseError(
      hearingProtectionAssessmentResponse.error,
      "Unable to load employee hearing protection assessment",
    );

    const organizationName = z
      .object({ name: z.string() })
      .parse(organizationResponse.data).name;
    const departmentName = departmentResponse.data
      ? z.object({ name: z.string() }).parse(departmentResponse.data).name
      : null;
    const directoryRow = EmployeeDirectoryRowSchema.parse(directoryResponse.data);
    const latestThaiEvaluationStatus = normalizeClinicalResultStatus(
      directoryRow.latest_evaluation_status,
    );
    const followUpStatus = normalizeFollowUpStatus(directoryRow.follow_up_status);
    const baselineRow = baselineResponse.data
      ? BaselineRowSchema.parse(baselineResponse.data)
      : null;
    const evaluations = z
      .array(EvaluationRowSchema)
      .parse(evaluationsResponse.data ?? [])
      .map(mapEvaluation);
    const evaluationByAudiogram = new Map<string, (typeof evaluations)[number]>();
    for (const evaluation of evaluations) {
      if (evaluation.ruleCode === "THAI_HEARING_2561"
        && !evaluationByAudiogram.has(evaluation.currentAudiogramId)) {
        evaluationByAudiogram.set(evaluation.currentAudiogramId, evaluation);
      }
    }
    const audiogramRows = z
      .array(ProfileAudiogramRowSchema)
      .parse(audiogramsResponse.data ?? []);
    const audiograms = audiogramRows.map((audiogram) => {
      const pretestRelation = audiogram.audiogram_pretest_assessments;
      const pretest = Array.isArray(pretestRelation)
        ? pretestRelation[0] ?? null
        : pretestRelation;
      return {
      id: audiogram.id,
      examDate: audiogram.exam_date,
      examinedAt: audiogram.examined_at,
      examType: audiogram.exam_type,
      sourceMonitoringAudiogramId: audiogram.source_monitoring_audiogram_id,
      hoursSinceNoiseExposure: audiogram.hours_since_noise_exposure,
      confirmationEvidence: pretest
        ? {
            quietPeriodAnswer: pretest.quiet_period_answer,
            quietPeriodHours: pretest.quiet_period_hours,
            highNonoccupationalNoise: pretest.high_nonoccupational_noise,
            hearingProtectionUsedAsSubstitute:
              pretest.hearing_protection_during_quiet,
          }
        : null,
      isValid: audiogram.is_valid,
      validationNotes: audiogram.validation_notes,
      isActiveBaseline:
        baselineRow?.baseline_audiogram_id === audiogram.id,
      clinicalResult:
        evaluationByAudiogram.get(audiogram.id)?.status ?? null,
      thresholds: audiogram.audiogram_thresholds.flatMap((threshold) =>
        threshold.response_status === "MEASURED" && threshold.threshold_db_hl !== null
          ? [{
              ear: threshold.ear,
              frequencyHz: threshold.frequency_hz,
              thresholdDbHl: threshold.threshold_db_hl,
            }]
          : [],
      ),
      thresholdObservations: audiogram.audiogram_thresholds.map((threshold) => {
        if (threshold.response_status === "MEASURED" && threshold.threshold_db_hl !== null) {
          return {
            ear: threshold.ear,
            frequencyHz: threshold.frequency_hz,
            responseStatus: "MEASURED" as const,
            thresholdDbHl: threshold.threshold_db_hl,
          };
        }
        if (threshold.response_status === "NO_RESPONSE" && threshold.no_response_at_db_hl !== null) {
          return {
            ear: threshold.ear,
            frequencyHz: threshold.frequency_hz,
            responseStatus: "NO_RESPONSE" as const,
            noResponseAtDbHl: threshold.no_response_at_db_hl,
          };
        }
        return {
          ear: threshold.ear,
          frequencyHz: threshold.frequency_hz,
          responseStatus: "NOT_TESTED" as const,
        };
      }),
      };
    });
    const baselineAudiogram = baselineRow
      ? audiograms.find(
          (audiogram) => audiogram.id === baselineRow.baseline_audiogram_id,
        )
      : null;
    const monitoringAudiogram = [...audiograms]
      .reverse()
      .find((audiogram) => audiogram.examType === "ANNUAL");
    const immediateRetestAudiogram = monitoringAudiogram
      ? audiograms.find(
          (audiogram) =>
            audiogram.sourceMonitoringAudiogramId === monitoringAudiogram.id
            && audiogram.examType === "REPEAT",
        )
      : null;
    const confirmationAudiogram = monitoringAudiogram
      ? audiograms.find(
          (audiogram) =>
            audiogram.sourceMonitoringAudiogramId === monitoringAudiogram.id
            && audiogram.examType === "CONFIRMATION",
        )
      : null;
    const toDomainAudiogram = (
      audiogram: (typeof audiograms)[number],
    ): Audiogram => ({
      id: audiogram.id,
      employeeId: identityRow.id,
      examDate: audiogram.examDate,
      examType: audiogram.examType,
      hoursSinceNoiseExposure: audiogram.hoursSinceNoiseExposure ?? undefined,
      isValid: audiogram.isValid,
      validationNotes: audiogram.validationNotes ?? undefined,
      thresholds: audiogram.thresholds,
    });
    const nioshAnalysis = monitoringAudiogram
      ? analyzeNioshPersistence(
          baselineAudiogram ? toDomainAudiogram(baselineAudiogram) : null,
          toDomainAudiogram(monitoringAudiogram),
          immediateRetestAudiogram ? toDomainAudiogram(immediateRetestAudiogram) : null,
          confirmationAudiogram ? toDomainAudiogram(confirmationAudiogram) : null,
          confirmationAudiogram?.confirmationEvidence ?? null,
        )
      : null;
    const followUpRow = followUpResponse.data
      ? FollowUpRowSchema.parse(followUpResponse.data)
      : null;
    const latestFollowUp: FollowUpSummary = followUpRow
      ? {
          id: followUpRow.id,
          status: FollowUpCaseStatusSchema.parse(followUpRow.status),
          detectedDate: followUpRow.detected_date,
          repeatDueDate: followUpRow.repeat_due_date,
          repeatCompletedDate: followUpRow.repeat_completed_date,
          physicianReviewDate: followUpRow.physician_review_date,
          followUpDate: followUpRow.follow_up_date,
          closedDate: followUpRow.closed_date,
        }
      : null;
    const hearingProtectors = z
      .array(HearingProtectorRowSchema)
      .parse(protectorsResponse.data ?? [])
      .map(mapHearingProtector);
    const hearingProtectorById = new Map(
      hearingProtectors.map((protector) => [protector.id, protector]),
    );
    const assignmentRow = protectorAssignmentResponse.data
      ? HearingProtectorAssignmentRowSchema.parse(protectorAssignmentResponse.data)
      : null;
    const currentPrimaryProtector = assignmentRow
      ? hearingProtectorById.get(assignmentRow.hearing_protector_id) ?? null
      : null;
    if (assignmentRow && !currentPrimaryProtector) {
      throw new Error("Unable to resolve the assigned hearing protector catalog record");
    }
    const currentAssignment: HearingProtectorAssignmentSummary = assignmentRow && currentPrimaryProtector
      ? {
          id: assignmentRow.id,
          configuration: assignmentRow.configuration,
          effectiveFrom: assignmentRow.effective_from,
          effectiveTo: assignmentRow.effective_to,
          notes: assignmentRow.notes,
          protector: currentPrimaryProtector,
          secondaryProtector: assignmentRow.secondary_hearing_protector_id
            ? hearingProtectorById.get(assignmentRow.secondary_hearing_protector_id) ?? null
            : null,
        }
      : null;
    const assessmentRow = hearingProtectionAssessmentResponse.data
      ? HearingProtectionAssessmentRowSchema.parse(
          hearingProtectionAssessmentResponse.data,
        )
      : null;
    const latestAssessment: HearingProtectionAssessmentSummary = assessmentRow
      ? {
          id: assessmentRow.id,
          assignmentId: assessmentRow.assignment_id,
          noiseExposureId: assessmentRow.noise_exposure_id,
          status: assessmentRow.status,
          protectedExposureDbA: assessmentRow.protected_exposure_db_a,
          allowableExposureDbA: assessmentRow.allowable_exposure_db_a,
          protectionMarginDb: assessmentRow.protection_margin_db,
          governingMethod: assessmentRow.governing_method,
          ruleCode: assessmentRow.rule_code,
          ruleVersion: assessmentRow.rule_version,
          calculations: assessmentRow.calculations_json,
          reasons: assessmentRow.reasons_json,
          assessedAt: assessmentRow.assessed_at,
          exposureSnapshot: assessmentRow.input_snapshot_json.exposure,
        }
      : null;

    return {
      identity: {
        id: identityRow.id,
        employeeNumber: identityRow.employee_number,
        firstName: identityRow.first_name,
        lastName: identityRow.last_name,
        sex: identityRow.sex,
        dateOfBirth: identityRow.date_of_birth,
        jobTitle: identityRow.job_title,
        employmentStartDate: identityRow.employment_start_date,
        active: identityRow.active,
        organizationId: identityRow.organization_id,
        organizationName,
        departmentId: identityRow.department_id,
        departmentName,
        ...(identityRow.hospital_patients?.hospital_number
          ? {
              patientId: identityRow.patient_id ?? undefined,
              hospitalNumber: identityRow.hospital_patients.hospital_number,
            }
          : {}),
      },
      latestThaiEvaluationStatus,
      followUpStatus,
      nextAction: nextActionForEmployeeStatus(
        latestThaiEvaluationStatus,
        followUpStatus,
      ),
      activeBaseline:
        baselineRow && baselineAudiogram
          ? {
              historyId: baselineRow.id,
              audiogramId: baselineRow.baseline_audiogram_id,
              examDate: baselineAudiogram.examDate,
              reasonCode: baselineRow.reason_code,
              effectiveFrom: baselineRow.effective_from,
            }
          : null,
      audiograms,
      evaluations,
      nioshAnalysis,
      latestFollowUp,
      noiseExposures: z
        .array(NoiseExposureRowSchema)
        .parse(noiseResponse.data ?? [])
        .map((exposure) => ({
          id: exposure.id,
          measurementDate: exposure.measurement_date,
          scope: exposure.employee_id ? "EMPLOYEE" : "DEPARTMENT",
          twaDbA: exposure.twa_db_a,
          twaDbC: exposure.twa_db_c,
          lelDbA: exposure.lel_db_a,
          peakDb: exposure.peak_db,
          shiftHours: exposure.shift_hours,
          measurementMethod: exposure.measurement_method,
          exposureBasis: exposure.exposure_basis,
        })),
      hearingProtection: {
        availableProtectors: hearingProtectors.filter((protector) => protector.active),
        currentAssignment,
        latestAssessment,
      },
    };
  }

  async getEmployeeAudiogramReport(
    employeeId: string,
    audiogramId: string,
  ): Promise<EmployeeAudiogramReport | null> {
    const profile = await this.getEmployeeProfile(employeeId);
    if (!profile) return null;

    const selectedAudiogram = profile.audiograms.find((item) => item.id === audiogramId);
    if (!selectedAudiogram) return null;

    const reportContext = getPersistedReportContext(
      profile.audiograms,
      profile.evaluations,
      selectedAudiogram,
    );
    const monitoringEvaluationIds = profile.evaluations
      .filter(
        (item) => item.currentAudiogramId === reportContext.monitoringAudiogramId
          && item.ruleCode === "THAI_HEARING_2561",
      )
      .map((item) => item.id);
    const client = await createSupabaseServerClient();
    const followUpQuery = monitoringEvaluationIds.length > 0
      ? client
          .from("follow_up_cases")
          .select("id,status,detected_date,repeat_due_date,repeat_completed_date,physician_review_date,follow_up_date,closed_date")
          .eq("employee_id", employeeId)
          .in("trigger_evaluation_id", monitoringEvaluationIds)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });
    const importantHistoryQuery = profile.identity.hospitalNumber
      ? client
          .from("audiogram_hearing_condition_snapshots")
          .select("id,category,ear_scope,onset,information_source,details")
          .eq("audiogram_id", selectedAudiogram.id)
          .order("captured_at", { ascending: true })
      : Promise.resolve({ data: null, error: null });
    const [followUpResponse, importantHistoryResponse, nihlReview] = await Promise.all([
      followUpQuery,
      importantHistoryQuery,
      loadReportNihlReview(client, employeeId, selectedAudiogram.id),
    ]);
    assertNoDatabaseError(followUpResponse.error, "Unable to load report follow-up case");
    assertNoDatabaseError(importantHistoryResponse.error, "Unable to load report hearing history");

    const followUpRow = followUpResponse.data
      ? FollowUpRowSchema.parse(followUpResponse.data)
      : null;
    const relatedFollowUp: FollowUpSummary = followUpRow
      ? {
          id: followUpRow.id,
          status: FollowUpCaseStatusSchema.parse(followUpRow.status),
          detectedDate: followUpRow.detected_date,
          repeatDueDate: followUpRow.repeat_due_date,
          repeatCompletedDate: followUpRow.repeat_completed_date,
          physicianReviewDate: followUpRow.physician_review_date,
          followUpDate: followUpRow.follow_up_date,
          closedDate: followUpRow.closed_date,
        }
      : null;
    const importantHearingHistory = profile.identity.hospitalNumber
      ? z.array(ReportImportantHearingConditionRowSchema)
          .parse(importantHistoryResponse.data ?? [])
          .map((item) => ({
            id: item.id,
            category: item.category,
            earScope: item.ear_scope,
            onset: item.onset,
            source: item.information_source,
            details: item.details ?? "",
          }))
      : null;
    const referral = buildAaoHnsReferralContext(profile.audiograms, selectedAudiogram);

    return {
      identity: profile.identity,
      selectedAudiogram,
      baselineAudiogram: reportContext.baselineAudiogram,
      evaluations: reportContext.evaluations,
      relatedFollowUp,
      importantHearingHistory,
      nihlReview,
      referralScreening: referral.current,
      originalBaselineReferralScreening: referral.originalBaseline,
      generatedAt: new Date().toISOString(),
    };
  }

  async searchAudiograms(
    criteria: AudiogramSearchCriteria,
  ): Promise<AudiogramSearchResult> {
    const client = await createSupabaseServerClient();
    const firstRow = (criteria.page - 1) * criteria.pageSize;
    const lastRow = firstRow + criteria.pageSize - 1;
    let query = client
      .from("audiogram_directory")
      .select("*", { count: "exact" })
      .order("exam_date", { ascending: false })
      .order("employee_number")
      .range(firstRow, lastRow);

    if (criteria.query) {
      const search = `%${criteria.query}%`;
      query = query.or(
        `employee_number.ilike.${search},first_name.ilike.${search},last_name.ilike.${search}`,
      );
    }

    if (criteria.organizationId) {
      query = query.eq("organization_id", criteria.organizationId);
    }

    if (criteria.examType) {
      query = query.eq("exam_type", criteria.examType);
    }

    if (criteria.year) {
      query = query
        .gte("exam_date", `${criteria.year}-01-01`)
        .lte("exam_date", `${criteria.year}-12-31`);
    }

    const [audiogramsResponse, organizationsResponse, yearsResponse] =
      await Promise.all([
        query,
        client
          .from("organization_directory")
          .select("id,name")
          .eq("active", true)
          .order("name"),
        client
          .from("audiogram_year_directory")
          .select("exam_year")
          .order("exam_year", { ascending: false }),
      ]);

    assertNoDatabaseError(
      audiogramsResponse.error,
      "Unable to search audiograms",
    );
    assertNoDatabaseError(
      organizationsResponse.error,
      "Unable to load audiogram organizations",
    );
    assertNoDatabaseError(
      yearsResponse.error,
      "Unable to load audiogram years",
    );

    const organizations = z
      .array(z.object({ id: z.string().uuid(), name: z.string() }))
      .parse(organizationsResponse.data ?? [])
      .map((row): DirectoryOption => ({ id: row.id, label: row.name }));
    const availableYears = Array.from(
      new Set(
        z
          .array(z.object({ exam_year: z.number().int() }))
          .parse(yearsResponse.data ?? [])
          .map((row) => row.exam_year),
      ),
    ).sort((left, right) => right - left);

    return {
      items: z
        .array(AudiogramDirectoryRowSchema)
        .parse(audiogramsResponse.data ?? [])
        .map(mapAudiogram),
      total: audiogramsResponse.count ?? 0,
      page: criteria.page,
      pageSize: criteria.pageSize,
      organizations,
      availableYears,
    };
  }

  async searchFollowUpCases(
    criteria: FollowUpSearchCriteria,
  ): Promise<FollowUpSearchResult> {
    const client = await createSupabaseServerClient();
    const firstRow = (criteria.page - 1) * criteria.pageSize;
    const lastRow = firstRow + criteria.pageSize - 1;
    const today = new Date().toISOString().slice(0, 10);
    const dueSoonDate = new Date();
    dueSoonDate.setUTCDate(dueSoonDate.getUTCDate() + 14);
    const dueSoon = dueSoonDate.toISOString().slice(0, 10);

    let query = client
      .from("follow_up_queue")
      .select("*", { count: "exact" })
      .order("is_overdue", { ascending: false })
      .order("repeat_due_date", { ascending: true, nullsFirst: false })
      .order("detected_date", { ascending: false })
      .range(firstRow, lastRow);

    if (criteria.query) {
      const search = `%${criteria.query}%`;
      query = query.or(
        `employee_number.ilike.${search},first_name.ilike.${search},last_name.ilike.${search}`,
      );
    }
    if (criteria.organizationId) {
      query = query.eq("organization_id", criteria.organizationId);
    }

    switch (criteria.filter) {
      case "ALL_OPEN":
        query = query.neq("status", "CLOSED");
        break;
      case "REPEAT_REQUIRED":
        query = query.in("status", ["SHIFT_DETECTED", "REPEAT_REQUIRED"]);
        break;
      case "OVERDUE":
        query = query.eq("is_overdue", true);
        break;
      case "DUE_SOON":
        query = query
          .in("status", ["SHIFT_DETECTED", "REPEAT_REQUIRED"])
          .gte("repeat_due_date", today)
          .lte("repeat_due_date", dueSoon);
        break;
      case "PHYSICIAN_REVIEW":
        query = query.in("status", ["REPEAT_COMPLETED", "PHYSICIAN_REVIEW"]);
        break;
      case "INTERVENTION_REQUIRED":
        query = query.eq("status", "INTERVENTION_REQUIRED");
        break;
      case "FOLLOW_UP":
        query = query.eq("status", "FOLLOW_UP");
        break;
      case "CLOSED":
        query = query.eq("status", "CLOSED");
        break;
    }

    let countQuery = client
      .from("follow_up_queue")
      .select("status,is_overdue,repeat_due_date");
    if (criteria.organizationId) {
      countQuery = countQuery.eq("organization_id", criteria.organizationId);
    }

    const [casesResponse, options, countResponse] = await Promise.all([
      query,
      loadDirectoryOptions(client),
      countQuery,
    ]);
    assertNoDatabaseError(casesResponse.error, "Unable to search follow-up cases");
    assertNoDatabaseError(countResponse.error, "Unable to load follow-up counts");

    const rows = z
      .array(FollowUpQueueRowSchema)
      .parse(casesResponse.data ?? []);
    const countRows = z
      .array(
        z.object({
          status: FollowUpCaseStatusSchema,
          is_overdue: z.boolean(),
          repeat_due_date: z.string().nullable(),
        }),
      )
      .parse(countResponse.data ?? []);

    return {
      items: rows.map(mapFollowUpCase),
      total: casesResponse.count ?? 0,
      page: criteria.page,
      pageSize: criteria.pageSize,
      organizations: options.organizations,
      counts: {
        allOpen: countRows.filter((row) => row.status !== "CLOSED").length,
        repeatRequired: countRows.filter((row) =>
          ["SHIFT_DETECTED", "REPEAT_REQUIRED"].includes(row.status),
        ).length,
        overdue: countRows.filter((row) => row.is_overdue).length,
        dueSoon: countRows.filter(
          (row) =>
            ["SHIFT_DETECTED", "REPEAT_REQUIRED"].includes(row.status) &&
            row.repeat_due_date !== null &&
            row.repeat_due_date >= today &&
            row.repeat_due_date <= dueSoon,
        ).length,
        physicianReview: countRows.filter((row) =>
          ["REPEAT_COMPLETED", "PHYSICIAN_REVIEW"].includes(row.status),
        ).length,
        interventionRequired: countRows.filter(
          (row) => row.status === "INTERVENTION_REQUIRED",
        ).length,
        followUp: countRows.filter((row) => row.status === "FOLLOW_UP").length,
      },
    };
  }

  async getFollowUpCase(id: string): Promise<FollowUpCaseDetail | null> {
    const client = await createSupabaseServerClient();
    const [caseResponse, auditResponse] = await Promise.all([
      client.from("follow_up_queue").select("*").eq("id", id).maybeSingle(),
      client
        .from("audit_logs")
        .select("id,action,old_values_json,new_values_json,created_at")
        .eq("entity_type", "follow_up_case")
        .eq("entity_id", id)
        .order("created_at", { ascending: false }),
    ]);
    assertNoDatabaseError(caseResponse.error, "Unable to load follow-up case");
    assertNoDatabaseError(auditResponse.error, "Unable to load case audit trail");
    if (!caseResponse.data) return null;

    const row = FollowUpQueueRowSchema.parse(caseResponse.data);
    const listItem = mapFollowUpCase(row);
    const evaluation = mapEvaluation({
      id: row.trigger_evaluation_id,
      current_audiogram_id: row.current_audiogram_id,
      baseline_audiogram_id: null,
      status: row.evaluation_status,
      rule_version: row.rule_version,
      evaluation_result_json: row.evaluation_result_json,
      evaluated_at: row.evaluated_at,
    });
    const statusValue = (value: unknown): string | null => {
      const parsed = z
        .object({ status: z.string() })
        .safeParse(value);
      return parsed.success ? parsed.data.status : null;
    };

    return {
      ...listItem,
      triggerEvaluationId: row.trigger_evaluation_id,
      evaluation,
      repeatCompletedDate: row.repeat_completed_date,
      physicianReviewDate: row.physician_review_date,
      interventionRequired: row.intervention_required,
      interventionNotes: row.intervention_notes,
      followUpDate: row.follow_up_date,
      closedDate: row.closed_date,
      allowedNextStatuses: FOLLOW_UP_TRANSITIONS[row.status],
      auditTrail: z
        .array(AuditRowSchema)
        .parse(auditResponse.data ?? [])
        .map((event) => ({
          id: event.id,
          action: event.action,
          previousStatus: statusValue(event.old_values_json),
          newStatus: statusValue(event.new_values_json),
          createdAt: event.created_at,
        })),
    };
  }

  async getPopulationDashboard(): Promise<PopulationDashboard> {
    const client = await createSupabaseServerClient();
    const [organizationsResponse, departmentsResponse] = await Promise.all([
      client
        .from("organization_population_surveillance")
        .select("*")
        .order("organization_name"),
      client
        .from("department_population_surveillance")
        .select("*")
        .eq("potential_deterioration_cluster", true)
        .order("shift_prevalence_pct", { ascending: false })
        .order("threshold_shifts", { ascending: false })
        .limit(8),
    ]);
    assertNoDatabaseError(
      organizationsResponse.error,
      "Unable to load population dashboard",
    );
    assertNoDatabaseError(
      departmentsResponse.error,
      "Unable to load department attention list",
    );

    const organizations = z
      .array(OrganizationPopulationRowSchema)
      .parse(organizationsResponse.data ?? [])
      .map(mapOrganizationPopulation);
    const attentionDepartments = z
      .array(DepartmentPopulationRowSchema)
      .parse(departmentsResponse.data ?? [])
      .map(mapDepartmentPopulation);

    return {
      totals: aggregatePopulationMetrics(organizations),
      organizations,
      attentionDepartments,
    };
  }

  async getOrganizationAnalytics(
    id: string,
  ): Promise<OrganizationAnalytics | null> {
    const client = await createSupabaseServerClient();
    const [organizationResponse, departmentsResponse] = await Promise.all([
      client
        .from("organization_population_surveillance")
        .select("*")
        .eq("organization_id", id)
        .maybeSingle(),
      client
        .from("department_population_surveillance")
        .select("*")
        .eq("organization_id", id)
        .order("shift_prevalence_pct", {
          ascending: false,
          nullsFirst: false,
        })
        .order("department_name"),
    ]);
    assertNoDatabaseError(
      organizationResponse.error,
      "Unable to load organization analytics",
    );
    assertNoDatabaseError(
      departmentsResponse.error,
      "Unable to load department analytics",
    );
    if (!organizationResponse.data) return null;

    return {
      summary: mapOrganizationPopulation(
        OrganizationPopulationRowSchema.parse(organizationResponse.data),
      ),
      departments: z
        .array(DepartmentPopulationRowSchema)
        .parse(departmentsResponse.data ?? [])
        .map(mapDepartmentPopulation),
    };
  }

  async getDepartmentAnalytics(
    organizationId: string,
    departmentId: string,
  ): Promise<DepartmentPopulationSummary | null> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("department_population_surveillance")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("department_id", departmentId)
      .maybeSingle();
    assertNoDatabaseError(
      response.error,
      "Unable to load department analytics",
    );
    return response.data
      ? mapDepartmentPopulation(DepartmentPopulationRowSchema.parse(response.data))
      : null;
  }

  async searchAuditLogs(
    criteria: AuditLogSearchCriteria,
  ): Promise<AuditLogSearchResult> {
    const client = await createSupabaseServerClient();
    const firstRow = (criteria.page - 1) * criteria.pageSize;
    const lastRow = firstRow + criteria.pageSize - 1;
    let query = client
      .from("audit_log_directory")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(firstRow, lastRow);

    if (criteria.query) {
      const search = `%${criteria.query}%`;
      query = query.or(
        `action.ilike.${search},entity_type.ilike.${search},actor_email.ilike.${search}`,
      );
    }
    if (criteria.organizationId) query = query.eq("organization_id", criteria.organizationId);
    if (criteria.action) query = query.eq("action", criteria.action);
    if (criteria.entityType) query = query.eq("entity_type", criteria.entityType);

    const [logsResponse, organizationsResponse, facetsResponse] = await Promise.all([
      query,
      client.from("organization_directory").select("id,name").eq("active", true).order("name"),
      client.from("audit_log_directory").select("action,entity_type").order("action").limit(1000),
    ]);
    assertNoDatabaseError(logsResponse.error, "Unable to search audit logs");
    assertNoDatabaseError(organizationsResponse.error, "Unable to load audit organizations");
    assertNoDatabaseError(facetsResponse.error, "Unable to load audit filters");

    const organizations = z.array(z.object({ id: z.string().uuid(), name: z.string() }))
      .parse(organizationsResponse.data ?? [])
      .map((row): DirectoryOption => ({ id: row.id, label: row.name }));
    const facets = z.array(z.object({ action: z.string(), entity_type: z.string() }))
      .parse(facetsResponse.data ?? []);

    return {
      items: z.array(AuditDirectoryRowSchema).parse(logsResponse.data ?? []).map(
        (row): AuditLogListItem => mapAuditLog(row),
      ),
      total: logsResponse.count ?? 0,
      page: criteria.page,
      pageSize: criteria.pageSize,
      organizations,
      actions: Array.from(new Set(facets.map((row) => row.action))).sort(),
      entityTypes: Array.from(new Set(facets.map((row) => row.entity_type))).sort(),
    };
  }

  async getAuditLog(id: string): Promise<AuditLogDetail | null> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("audit_log_directory")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    assertNoDatabaseError(response.error, "Unable to load audit log");
    return response.data ? mapAuditLog(AuditDirectoryRowSchema.parse(response.data)) : null;
  }

  async searchBaselineGovernance(
    criteria: BaselineGovernanceSearchCriteria,
  ): Promise<BaselineGovernanceSearchResult> {
    const client = await createSupabaseServerClient();
    const currentSuggestionResponse = await client
      .from("baseline_interpretation_suggestions")
      .select("id")
      .is("superseded_by_suggestion_id", null)
      .limit(2000);
    assertNoDatabaseError(
      currentSuggestionResponse.error,
      "Unable to load current baseline suggestion identities",
    );
    const currentSuggestionIds = z.array(z.object({ id: z.string().uuid() }))
      .parse(currentSuggestionResponse.data ?? [])
      .map((item) => item.id);
    const firstRow = (criteria.page - 1) * criteria.pageSize;
    const lastRow = firstRow + criteria.pageSize - 1;
    let query = client
      .from("baseline_governance_directory")
      .select("*", { count: "exact" })
      .in("id", currentSuggestionIds.length > 0
        ? currentSuggestionIds
        : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: false })
      .range(firstRow, lastRow);
    if (criteria.query) {
      const search = `%${criteria.query}%`;
      query = query.or(
        `employee_number.ilike.${search},first_name.ilike.${search},last_name.ilike.${search},suggestion_type.ilike.${search}`,
      );
    }
    if (criteria.organizationId) query = query.eq("organization_id", criteria.organizationId);
    if (criteria.framework) query = query.eq("framework", criteria.framework);
    if (criteria.reviewStatus) query = query.eq("review_status", criteria.reviewStatus);

    const [suggestionsResponse, organizationsResponse, statusesResponse] = await Promise.all([
      query,
      client.from("organization_directory").select("id,name").eq("active", true).order("name"),
      client.from("baseline_governance_directory").select("review_status").in(
        "id",
        currentSuggestionIds.length > 0
          ? currentSuggestionIds
          : ["00000000-0000-0000-0000-000000000000"],
      ).limit(1000),
    ]);
    assertNoDatabaseError(suggestionsResponse.error, "Unable to search baseline governance");
    assertNoDatabaseError(organizationsResponse.error, "Unable to load governance organizations");
    assertNoDatabaseError(statusesResponse.error, "Unable to load governance counts");
    const statuses = z.array(z.object({
      review_status: z.enum(["PENDING", "APPROVED", "REJECTED", "DEFERRED"]),
    })).parse(statusesResponse.data ?? []);

    return {
      items: z.array(BaselineGovernanceRowSchema).parse(suggestionsResponse.data ?? []).map(
        (row): BaselineGovernanceListItem => mapBaselineGovernance(row),
      ),
      total: suggestionsResponse.count ?? 0,
      page: criteria.page,
      pageSize: criteria.pageSize,
      organizations: z.array(z.object({ id: z.string().uuid(), name: z.string() }))
        .parse(organizationsResponse.data ?? [])
        .map((row): DirectoryOption => ({ id: row.id, label: row.name })),
      counts: {
        PENDING: statuses.filter((row) => row.review_status === "PENDING").length,
        APPROVED: statuses.filter((row) => row.review_status === "APPROVED").length,
        REJECTED: statuses.filter((row) => row.review_status === "REJECTED").length,
        DEFERRED: statuses.filter((row) => row.review_status === "DEFERRED").length,
      },
    };
  }

  async getBaselineGovernanceSuggestion(
    id: string,
  ): Promise<BaselineGovernanceDetail | null> {
    const client = await createSupabaseServerClient();
    const response = await client
      .from("baseline_governance_directory")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    assertNoDatabaseError(response.error, "Unable to load baseline suggestion");
    return response.data
      ? mapBaselineGovernance(BaselineGovernanceRowSchema.parse(response.data))
      : null;
  }
}
