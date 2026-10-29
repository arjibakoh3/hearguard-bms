import "server-only";

import { z } from "zod";
import type { PaperlessAudiometryRepository } from "@/application/ports/paperless-audiometry-repository";
import type {
  PaperlessAudiogramInput,
  PaperlessAudiogramRecord,
  PaperlessDirectoryRecord,
  PaperlessWorkspace,
  HospitalPatientEmploymentSummary,
  HospitalPatientTimeline,
  ImportantHearingHistoryState,
  ImportantHearingCondition,
  PendingEmploymentTransition,
  PriorHistorySnapshot,
} from "@/application/paperless-audiometry-models";
import type { AudiogramThresholdObservation } from "@/domain/hearing";
import { createDatabaseClient } from "@/infrastructure/postgres/server-client";

const NumericSchema = z.union([z.number(), z.string().transform(Number)]);
const NullableNumericSchema = NumericSchema.nullable();
const ExamTypeSchema = z.enum(["BASELINE", "ANNUAL", "REPEAT", "CONFIRMATION", "OTHER"]);
const RecordStatusSchema = z.enum(["DRAFT", "FINAL", "SUPERSEDED", "VOID"]);
const EarSchema = z.enum(["LEFT", "RIGHT"]);
const FrequencySchema = z.union([
  z.literal(500), z.literal(1000), z.literal(2000), z.literal(3000),
  z.literal(4000), z.literal(6000), z.literal(8000),
]);

const EmployeeRowSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  department_id: z.string().uuid().nullable(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  hospital_number: z.string(),
  organization_name: z.string(),
  organization_name_th: z.string().nullable(),
  department_name: z.string().nullable(),
  employment_start_date: z.string().nullable(),
  employment_end_date: z.string().nullable(),
  active: z.boolean(),
});

const OrganizationOptionRowSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  name_th: z.string().nullable(),
});

const EmploymentSummarySchema = z.object({
  employeeId: z.string().uuid(),
  organizationId: z.string().uuid(),
  organizationName: z.string(),
  organizationNameTh: z.string().nullable(),
  employeeNumber: z.string(),
  fullName: z.string(),
  employmentStartDate: z.string().nullable(),
  employmentEndDate: z.string().nullable(),
  active: z.boolean(),
  canManage: z.boolean(),
});

const PatientEmploymentSummarySchema = z.object({
  patientId: z.string().uuid(),
  hospitalNumber: z.string(),
  hasHiddenEmployment: z.boolean(),
  employments: z.array(EmploymentSummarySchema),
});

const DirectoryRowSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  record_status: RecordStatusSchema,
  exam_type: ExamTypeSchema,
  exam_date: z.string(),
  examined_at: z.string(),
  finalized_at: z.string().nullable(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  hospital_number: z.string(),
  organization_name: z.string(),
  department_name: z.string().nullable(),
  examiner: z.string().nullable(),
  location: z.string().nullable(),
  observation_count: z.number().int().nonnegative(),
});

const RecordRowSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  exam_type: ExamTypeSchema,
  examined_at: z.string(),
  test_context: z.string().nullable(),
  hours_since_noise_exposure: NullableNumericSchema,
  audiometer_model: z.string().nullable(),
  audiometer_serial: z.string().nullable(),
  calibration_date: z.string().nullable(),
  examiner: z.string().nullable(),
  location: z.string().nullable(),
  is_valid: z.boolean(),
  validation_notes: z.string().nullable(),
  source_monitoring_audiogram_id: z.string().uuid().nullable(),
  follow_up_case_id: z.string().uuid().nullable(),
  supersedes_audiogram_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  finalized_by: z.string().uuid().nullable(),
  audiometer_id: z.string().uuid().nullable(),
  examiner_user_id: z.string().uuid().nullable(),
  equipment_calibration_status: z.enum(["CURRENT", "OVERDUE", "UNKNOWN"]).nullable(),
  equipment_calibration_acknowledged: z.boolean(),
});

const ThresholdRowSchema = z.object({
  ear: EarSchema,
  frequency_hz: FrequencySchema,
  response_status: z.enum(["MEASURED", "NO_RESPONSE", "NOT_TESTED"]),
  threshold_db_hl: NullableNumericSchema,
  no_response_at_db_hl: NullableNumericSchema,
});

const PretestRowSchema = z.object({
  history_capture_mode: z.enum([
    "QUICK_SCREEN", "UNCHANGED_FROM_PRIOR", "UPDATED_FROM_PRIOR", "LEGACY_FULL",
  ]),
  source_history_audiogram_id: z.string().uuid().nullable(),
  quiet_period_answer: z.enum(["YES", "NO", "UNKNOWN"]),
  quiet_period_hours: NullableNumericSchema,
  hearing_protection_during_quiet: z.enum(["YES", "NO", "UNKNOWN"]),
  high_nonoccupational_noise: z.enum(["YES", "NO", "UNKNOWN"]),
  general_notes: z.string().nullable(),
  important_history_capture_mode: z.enum([
    "CONFIRMED_CURRENT", "UPDATED_CURRENT", "COPY_SOURCE", "LEGACY_NONE",
  ]),
  important_history_source_audiogram_id: z.string().uuid().nullable(),
  important_history_snapshot_present: z.boolean(),
});

const ImportantConditionRowSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  category: z.enum([
    "PRE_EXISTING_HEARING_LOSS",
    "PRE_EXISTING_HEARING_DISABILITY",
    "OTHER_IMPORTANT_HEARING_HISTORY",
  ]),
  ear_scope: z.enum(["LEFT", "RIGHT", "BOTH", "UNKNOWN"]),
  onset: z.enum(["CONGENITAL_OR_CHILDHOOD", "LATER", "UNKNOWN"]),
  information_source: z.enum(["PATIENT_OR_FAMILY", "PRIOR_MEDICAL_RECORD", "PHYSICIAN_CONFIRMED"]),
  details: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ENTERED_IN_ERROR"]),
  status_reason: z.string().nullable(),
  recorded_by: z.string().uuid().nullable(),
  recorded_at: z.string(),
});

const ImportantSnapshotRowSchema = z.object({
  id: z.string().uuid(),
  source_condition_id: z.string().uuid().nullable(),
  category: ImportantConditionRowSchema.shape.category,
  ear_scope: ImportantConditionRowSchema.shape.ear_scope,
  onset: ImportantConditionRowSchema.shape.onset,
  information_source: ImportantConditionRowSchema.shape.information_source,
  details: z.string().nullable(),
  captured_at: z.string(),
});

const AudiometerRowSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  model: z.string(),
  serial_number: z.string(),
  location: z.string(),
  calibration_date: z.string().nullable(),
  active: z.boolean(),
});

const ExaminerOptionSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  organizationIds: z.array(z.string().uuid()),
  global: z.boolean(),
});

const HistoryRowSchema = z.object({
  question_code: z.string(),
  answer: z.enum(["YES", "NO", "UNKNOWN"]),
  ear_scope: z.enum(["LEFT", "RIGHT", "BOTH"]).nullable(),
  details: z.string().nullable(),
});

const OtoscopyRowSchema = z.object({
  ear: EarSchema,
  examination_status: z.enum(["NORMAL", "ABNORMAL", "NOT_EXAMINED"]),
  canal_obstruction: z.boolean(),
  abnormal_tympanic_membrane: z.boolean(),
  perforation: z.boolean(),
  other_finding: z.boolean(),
  notes: z.string().nullable(),
});

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function mapDirectory(row: z.infer<typeof DirectoryRowSchema>): PaperlessDirectoryRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    employeeId: row.employee_id,
    recordStatus: row.record_status,
    examType: row.exam_type,
    examDate: row.exam_date,
    examinedAt: row.examined_at,
    finalizedAt: row.finalized_at,
    employeeNumber: row.employee_number,
    employeeName: `${row.first_name} ${row.last_name}`,
    hospitalNumber: row.hospital_number,
    organizationName: row.organization_name,
    departmentName: row.department_name,
    examiner: row.examiner,
    location: row.location,
    observationCount: row.observation_count,
  };
}

function mapThreshold(row: z.infer<typeof ThresholdRowSchema>): AudiogramThresholdObservation {
  if (row.response_status === "MEASURED" && row.threshold_db_hl !== null) {
    return {
      ear: row.ear,
      frequencyHz: row.frequency_hz,
      responseStatus: "MEASURED",
      thresholdDbHl: row.threshold_db_hl,
    };
  }
  if (row.response_status === "NO_RESPONSE" && row.no_response_at_db_hl !== null) {
    return {
      ear: row.ear,
      frequencyHz: row.frequency_hz,
      responseStatus: "NO_RESPONSE",
      noResponseAtDbHl: row.no_response_at_db_hl,
    };
  }
  return {
    ear: row.ear,
    frequencyHz: row.frequency_hz,
    responseStatus: "NOT_TESTED",
  };
}

function mapImportantCondition(row: z.infer<typeof ImportantConditionRowSchema>): ImportantHearingCondition {
  return {
    id: row.id,
    patientId: row.patient_id,
    category: row.category,
    earScope: row.ear_scope,
    onset: row.onset,
    source: row.information_source,
    details: row.details ?? "",
    status: row.status,
    statusReason: row.status_reason ?? "",
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
  };
}

export class PostgresPaperlessAudiometryRepository
  implements PaperlessAudiometryRepository
{
  async getWorkspace(): Promise<PaperlessWorkspace> {
    const client = await createDatabaseClient();
    const [employeeResponse, organizationResponse, departmentResponse, recordResponse, baselineResponse, audiometerResponse, examinerResponse, userResponse] = await Promise.all([
      client.from("hospital_employee_directory").select("*").eq("active", true).order("hospital_number"),
      client.from("organization_directory").select("id,code,name,name_th").eq("active", true).order("name"),
      client.from("department_directory").select("id,organization_id,name").eq("active", true).order("name"),
      client.from("paperless_audiometry_directory").select("*").order("updated_at", { ascending: false }).limit(100),
      client.from("hearing_baseline_history").select("employee_id").eq("status", "ACTIVE").eq("framework_or_context", "THAI_OPERATIONAL"),
      client.from("hospital_audiometers").select("id,display_name,model,serial_number,location,calibration_date,active").order("display_name"),
      client.rpc("paperless_examiner_options"),
      client.auth.getUser(),
    ]);
    assertNoError(employeeResponse.error, "Unable to load hospital employee directory");
    assertNoError(organizationResponse.error, "Unable to load organizations");
    assertNoError(departmentResponse.error, "Unable to load departments");
    assertNoError(recordResponse.error, "Unable to load paperless records");
    assertNoError(baselineResponse.error, "Unable to load active baselines");
    assertNoError(audiometerResponse.error, "Unable to load hospital audiometers");
    assertNoError(examinerResponse.error, "Unable to load examiner options");
    if (userResponse.error || !userResponse.data.user) throw new Error("Unable to resolve current Paperless user");
    const activeBaselineEmployeeIds = new Set(
      z.array(z.object({ employee_id: z.string().uuid() }))
        .parse(baselineResponse.data ?? [])
        .map((item) => item.employee_id),
    );
    const followUpResponse = await client
      .from("follow_up_cases")
      .select("id,employee_id,trigger_evaluation_id,status")
      .order("created_at", { ascending: false });
    assertNoError(followUpResponse.error, "Unable to load follow-up sequences");
    const FollowUpRowSchema = z.object({
      id: z.string().uuid(),
      employee_id: z.string().uuid(),
      trigger_evaluation_id: z.string().uuid(),
      status: z.string(),
    });
    const followUps = z.array(FollowUpRowSchema).parse(followUpResponse.data ?? []);
    const evaluationResponse = followUps.length > 0
      ? await client
          .from("surveillance_evaluations")
          .select("id,current_audiogram_id")
          .in("id", followUps.map((item) => item.trigger_evaluation_id))
      : { data: [], error: null };
    assertNoError(evaluationResponse.error, "Unable to resolve monitoring sequences");
    const evaluations = z.array(z.object({
      id: z.string().uuid(),
      current_audiogram_id: z.string().uuid(),
    })).parse(evaluationResponse.data ?? []);
    const monitoringByEvaluation = new Map(
      evaluations.map((item) => [item.id, item.current_audiogram_id]),
    );
    const records = z.array(DirectoryRowSchema).parse(recordResponse.data ?? []).map(mapDirectory);
    const recordById = new Map(records.map((item) => [item.id, item]));

    return {
      employees: z.array(EmployeeRowSchema).parse(employeeResponse.data ?? []).map((row) => ({
        id: row.id,
        patientId: row.patient_id,
        organizationId: row.organization_id,
        departmentId: row.department_id,
        employeeNumber: row.employee_number,
        fullName: `${row.first_name} ${row.last_name}`,
        hospitalNumber: row.hospital_number,
        organizationName: row.organization_name,
        departmentName: row.department_name,
        hasActiveBaseline: activeBaselineEmployeeIds.has(row.id),
      })),
      organizations: z.array(OrganizationOptionRowSchema)
        .parse(organizationResponse.data ?? [])
        .map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          nameTh: row.name_th,
          label: row.name_th && row.name_th !== row.name ? `${row.name_th} · ${row.name}` : row.name,
        })),
      departments: z.array(z.object({ id: z.string().uuid(), organization_id: z.string().uuid(), name: z.string() }))
        .parse(departmentResponse.data ?? [])
        .map((row) => ({ id: row.id, organizationId: row.organization_id, label: row.name })),
      audiometers: z.array(AudiometerRowSchema).parse(audiometerResponse.data ?? []).map((row) => ({
        id: row.id,
        displayName: row.display_name,
        model: row.model,
        serialNumber: row.serial_number,
        location: row.location,
        calibrationDate: row.calibration_date,
        active: row.active,
      })),
      examiners: z.array(ExaminerOptionSchema).parse(examinerResponse.data ?? []),
      currentUserId: userResponse.data.user.id,
      records,
      sequences: followUps.flatMap((item) => {
        const monitoringAudiogramId = monitoringByEvaluation.get(item.trigger_evaluation_id);
        const monitoring = monitoringAudiogramId ? recordById.get(monitoringAudiogramId) : null;
        return monitoringAudiogramId && monitoring ? [{
          monitoringAudiogramId,
          followUpCaseId: item.id,
          employeeId: item.employee_id,
          examDate: monitoring.examDate,
          status: item.status,
        }] : [];
      }),
    };
  }

  async getRecord(id: string): Promise<PaperlessAudiogramRecord | null> {
    const client = await createDatabaseClient();
    const [directoryResponse, recordResponse, thresholdResponse, pretestResponse, historyResponse, otoscopyResponse, importantSnapshotResponse] = await Promise.all([
      client.from("paperless_audiometry_directory").select("*").eq("id", id).maybeSingle(),
      client.from("audiograms").select("id,employee_id,exam_type,examined_at,test_context,hours_since_noise_exposure,audiometer_model,audiometer_serial,calibration_date,examiner,location,is_valid,validation_notes,source_monitoring_audiogram_id,follow_up_case_id,supersedes_audiogram_id,created_at,updated_at,finalized_by,audiometer_id,examiner_user_id,equipment_calibration_status,equipment_calibration_acknowledged").eq("id", id).maybeSingle(),
      client.from("audiogram_thresholds").select("ear,frequency_hz,response_status,threshold_db_hl,no_response_at_db_hl").eq("audiogram_id", id).order("ear").order("frequency_hz"),
      client.from("audiogram_pretest_assessments").select("history_capture_mode,source_history_audiogram_id,quiet_period_answer,quiet_period_hours,hearing_protection_during_quiet,high_nonoccupational_noise,general_notes,important_history_capture_mode,important_history_source_audiogram_id,important_history_snapshot_present").eq("audiogram_id", id).maybeSingle(),
      client.from("audiogram_history_responses").select("question_code,answer,ear_scope,details").eq("audiogram_id", id),
      client.from("audiogram_otoscopy_findings").select("ear,examination_status,canal_obstruction,abnormal_tympanic_membrane,perforation,other_finding,notes").eq("audiogram_id", id).order("ear"),
      client.from("audiogram_hearing_condition_snapshots").select("id,source_condition_id,category,ear_scope,onset,information_source,details,captured_at").eq("audiogram_id", id).order("category"),
    ]);
    assertNoError(directoryResponse.error, "Unable to load paperless directory record");
    assertNoError(recordResponse.error, "Unable to load audiogram record");
    if (!directoryResponse.data || !recordResponse.data) return null;
    assertNoError(thresholdResponse.error, "Unable to load threshold observations");
    assertNoError(pretestResponse.error, "Unable to load pretest assessment");
    assertNoError(historyResponse.error, "Unable to load history responses");
    assertNoError(otoscopyResponse.error, "Unable to load otoscopy findings");
    assertNoError(importantSnapshotResponse.error, "Unable to load important hearing history snapshot");

    const directory = mapDirectory(DirectoryRowSchema.parse(directoryResponse.data));
    const record = RecordRowSchema.parse(recordResponse.data);
    const pretest = pretestResponse.data ? PretestRowSchema.parse(pretestResponse.data) : null;
    const thresholds = z.array(ThresholdRowSchema).parse(thresholdResponse.data ?? []).map(mapThreshold);
    const history = z.array(HistoryRowSchema).parse(historyResponse.data ?? []);
    const otoscopy = z.array(OtoscopyRowSchema).parse(otoscopyResponse.data ?? []);
    const importantSnapshots = z.array(ImportantSnapshotRowSchema).parse(importantSnapshotResponse.data ?? []);
    let historySource: { id: string; examinedAt: string } | null = null;
    if (pretest?.source_history_audiogram_id) {
      const sourceResponse = await client
        .from("audiograms")
        .select("id,examined_at")
        .eq("id", pretest.source_history_audiogram_id)
        .maybeSingle();
      assertNoError(sourceResponse.error, "Unable to load history source record");
      if (sourceResponse.data) {
        historySource = {
          id: z.string().uuid().parse(sourceResponse.data.id),
          examinedAt: z.string().parse(sourceResponse.data.examined_at),
        };
      }
    }

    const chainResponse = await client
      .from("audiograms")
      .select("id,record_status,examined_at,finalized_at,supersedes_audiogram_id")
      .eq("employee_id", directory.employeeId)
      .order("created_at");
    assertNoError(chainResponse.error, "Unable to load revision chain");
    const ChainRowSchema = z.object({
      id: z.string().uuid(),
      record_status: RecordStatusSchema,
      examined_at: z.string(),
      finalized_at: z.string().nullable(),
      supersedes_audiogram_id: z.string().uuid().nullable(),
    });
    const allEmployeeRecords = z.array(ChainRowSchema).parse(chainResponse.data ?? []);
    const chainIds = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of allEmployeeRecords) {
        if (item.supersedes_audiogram_id && (chainIds.has(item.id) || chainIds.has(item.supersedes_audiogram_id))) {
          const previousSize = chainIds.size;
          chainIds.add(item.id);
          chainIds.add(item.supersedes_audiogram_id);
          changed ||= chainIds.size !== previousSize;
        }
      }
    }

    return {
      ...directory,
      employeeId: record.employee_id,
      examType: record.exam_type,
      examinedAt: record.examined_at,
      testContext: record.test_context ?? "",
      hoursSinceNoiseExposure: record.hours_since_noise_exposure,
      audiometerId: record.audiometer_id,
      examinerUserId: record.examiner_user_id,
      equipmentCalibrationAcknowledged: record.equipment_calibration_acknowledged,
      isValid: record.is_valid,
      validationNotes: record.validation_notes ?? "",
      sourceMonitoringAudiogramId: record.source_monitoring_audiogram_id,
      followUpCaseId: record.follow_up_case_id,
      supersedesAudiogramId: record.supersedes_audiogram_id,
      pretest: pretest ? {
        historyCaptureMode: pretest.history_capture_mode,
        sourceHistoryAudiogramId: pretest.source_history_audiogram_id,
        quietPeriodAnswer: pretest.quiet_period_answer,
        quietPeriodHours: pretest.quiet_period_hours,
        hearingProtectionDuringQuiet: pretest.hearing_protection_during_quiet,
        highNonoccupationalNoise: pretest.high_nonoccupational_noise,
        generalNotes: pretest.general_notes ?? "",
      } : {
        historyCaptureMode: "LEGACY_FULL",
        sourceHistoryAudiogramId: null,
        quietPeriodAnswer: "UNKNOWN",
        quietPeriodHours: null,
        hearingProtectionDuringQuiet: "UNKNOWN",
        highNonoccupationalNoise: "UNKNOWN",
        generalNotes: "",
      },
      importantHistory: {
        captureMode: pretest?.important_history_capture_mode ?? "LEGACY_NONE",
        sourceAudiogramId: pretest?.important_history_source_audiogram_id ?? null,
        conditions: importantSnapshots.map((item) => ({
          id: item.source_condition_id,
          category: item.category,
          earScope: item.ear_scope,
          onset: item.onset,
          source: item.information_source,
          details: item.details ?? "",
          status: "ACTIVE" as const,
          statusReason: "",
        })),
      },
      historyResponses: history.map((item) => ({
        questionCode: item.question_code as PaperlessAudiogramInput["historyResponses"][number]["questionCode"],
        answer: item.answer,
        earScope: item.ear_scope,
        details: item.details ?? "",
      })),
      otoscopyFindings: otoscopy.map((item) => ({
        ear: item.ear,
        examinationStatus: item.examination_status,
        canalObstruction: item.canal_obstruction,
        abnormalTympanicMembrane: item.abnormal_tympanic_membrane,
        perforation: item.perforation,
        otherFinding: item.other_finding,
        notes: item.notes ?? "",
      })),
      thresholds,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      finalizedBy: record.finalized_by,
      audiometerModel: record.audiometer_model ?? "",
      audiometerSerial: record.audiometer_serial ?? "",
      calibrationDate: record.calibration_date ?? "",
      examiner: record.examiner ?? "",
      location: record.location ?? "",
      equipmentCalibrationStatus: record.equipment_calibration_status,
      importantHistorySnapshotPresent: pretest?.important_history_snapshot_present ?? false,
      importantHistorySnapshots: importantSnapshots.map((item) => ({
        snapshotId: item.id,
        id: item.source_condition_id,
        sourceConditionId: item.source_condition_id,
        category: item.category,
        earScope: item.ear_scope,
        onset: item.onset,
        source: item.information_source,
        details: item.details ?? "",
        status: "ACTIVE" as const,
        capturedAt: item.captured_at,
      })),
      historySource,
      revisionChain: allEmployeeRecords
        .filter((item) => chainIds.has(item.id))
        .map((item) => ({
          id: item.id,
          recordStatus: item.record_status,
          examinedAt: item.examined_at,
          finalizedAt: item.finalized_at,
        })),
    };
  }

  async lookupPatientEmployments(hospitalNumber: string): Promise<HospitalPatientEmploymentSummary | null> {
    const client = await createDatabaseClient();
    const response = await client.rpc("lookup_hospital_patient_employments", {
      p_hospital_number: hospitalNumber,
    });
    assertNoError(response.error, "Unable to look up HN employments");
    return response.data ? PatientEmploymentSummarySchema.parse(response.data) : null;
  }

  async getImportantHearingHistory(employeeId: string): Promise<ImportantHearingHistoryState | null> {
    const client = await createDatabaseClient();
    const employeeResponse = await client
      .from("hospital_employee_directory")
      .select("patient_id")
      .eq("id", employeeId)
      .maybeSingle();
    assertNoError(employeeResponse.error, "Unable to resolve HN for important hearing history");
    if (!employeeResponse.data) return null;
    const patientId = z.object({ patient_id: z.string().uuid() }).parse(employeeResponse.data).patient_id;
    const conditionResponse = await client
      .from("hospital_patient_hearing_conditions")
      .select("id,patient_id,category,ear_scope,onset,information_source,details,status,status_reason,recorded_by,recorded_at")
      .eq("patient_id", patientId)
      .eq("status", "ACTIVE")
      .order("category");
    assertNoError(conditionResponse.error, "Unable to load important hearing history");
    return {
      patientId,
      conditions: z.array(ImportantConditionRowSchema)
        .parse(conditionResponse.data ?? [])
        .map(mapImportantCondition),
    };
  }

  async getPatientTimeline(patientId: string): Promise<HospitalPatientTimeline | null> {
    const client = await createDatabaseClient();
    const patientResponse = await client
      .from("hospital_patients")
      .select("id,hospital_number")
      .eq("id", patientId)
      .maybeSingle();
    assertNoError(patientResponse.error, "Unable to load hospital patient");
    if (!patientResponse.data) return null;

    const employmentResponse = await client
      .from("hospital_employee_directory")
      .select("*")
      .eq("patient_id", patientId)
      .order("employment_start_date", { ascending: true });
    assertNoError(employmentResponse.error, "Unable to load patient employments");
    const employments = z.array(EmployeeRowSchema).parse(employmentResponse.data ?? []);
    const employeeIds = employments.map((item) => item.id);
    if (employeeIds.length === 0) return null;

    const [audiogramResponse, baselineResponse, followUpResponse, transitionResponse, importantHistoryResponse] = await Promise.all([
      client.from("audiograms")
        .select("id,employee_id,exam_type,examined_at,record_status")
        .in("employee_id", employeeIds)
        .order("examined_at", { ascending: true }),
      client.from("hearing_baseline_history")
        .select("employee_id,effective_from")
        .in("employee_id", employeeIds)
        .eq("framework_or_context", "THAI_OPERATIONAL")
        .eq("status", "ACTIVE"),
      client.from("follow_up_cases")
        .select("employee_id,status,created_at")
        .in("employee_id", employeeIds)
        .neq("status", "CLOSED")
        .order("created_at", { ascending: false }),
      client.from("hospital_patient_employment_transitions")
        .select("id,from_employee_id,to_employee_id,transition_mode,effective_date,status")
        .eq("patient_id", patientId)
        .order("effective_date", { ascending: true }),
      client.from("hospital_patient_hearing_conditions")
        .select("id,patient_id,category,ear_scope,onset,information_source,details,status,status_reason,recorded_by,recorded_at")
        .eq("patient_id", patientId)
        .eq("status", "ACTIVE")
        .order("category"),
    ]);
    assertNoError(audiogramResponse.error, "Unable to load patient audiograms");
    assertNoError(baselineResponse.error, "Unable to load patient baselines");
    assertNoError(followUpResponse.error, "Unable to load patient follow-up cases");
    assertNoError(transitionResponse.error, "Unable to load employment transitions");
    assertNoError(importantHistoryResponse.error, "Unable to load patient important hearing history");

    const AudiogramTimelineRowSchema = z.object({
      id: z.string().uuid(),
      employee_id: z.string().uuid(),
      exam_type: ExamTypeSchema,
      examined_at: z.string(),
      record_status: RecordStatusSchema,
    });
    const BaselineTimelineRowSchema = z.object({ employee_id: z.string().uuid(), effective_from: z.string() });
    const FollowUpTimelineRowSchema = z.object({ employee_id: z.string().uuid(), status: z.string(), created_at: z.string() });
    const TransitionRowSchema = z.object({
      id: z.string().uuid(),
      from_employee_id: z.string().uuid(),
      to_employee_id: z.string().uuid(),
      transition_mode: z.enum(["TRANSFER", "CONCURRENT"]),
      effective_date: z.string(),
      status: z.enum(["COMPLETED", "PENDING_ADMIN_REVIEW"]),
    });
    const audiograms = z.array(AudiogramTimelineRowSchema).parse(audiogramResponse.data ?? []);
    const baselines = z.array(BaselineTimelineRowSchema).parse(baselineResponse.data ?? []);
    const followUps = z.array(FollowUpTimelineRowSchema).parse(followUpResponse.data ?? []);
    const transitions = z.array(TransitionRowSchema).parse(transitionResponse.data ?? []);

    const latestFollowUpByEmployee = new Map<string, string>();
    for (const item of followUps) {
      if (!latestFollowUpByEmployee.has(item.employee_id)) {
        latestFollowUpByEmployee.set(item.employee_id, item.status);
      }
    }
    const displayEmployment = [...employments].sort((left, right) =>
      Number(right.active) - Number(left.active)
      || (right.employment_start_date ?? "").localeCompare(left.employment_start_date ?? ""))[0];

    return {
      patientId: z.string().uuid().parse(patientResponse.data.id),
      hospitalNumber: z.string().parse(patientResponse.data.hospital_number),
      displayName: `${displayEmployment.first_name} ${displayEmployment.last_name}`,
      importantHistory: z.array(ImportantConditionRowSchema)
        .parse(importantHistoryResponse.data ?? [])
        .map(mapImportantCondition),
      employments: employments.map((employment) => ({
        employeeId: employment.id,
        organizationId: employment.organization_id,
        organizationName: employment.organization_name,
        organizationNameTh: employment.organization_name_th,
        employeeNumber: employment.employee_number,
        fullName: `${employment.first_name} ${employment.last_name}`,
        employmentStartDate: employment.employment_start_date,
        employmentEndDate: employment.employment_end_date,
        active: employment.active,
        activeBaselineDate: baselines.find((item) => item.employee_id === employment.id)?.effective_from ?? null,
        openFollowUpStatus: latestFollowUpByEmployee.get(employment.id) ?? null,
        audiograms: audiograms.filter((item) => item.employee_id === employment.id).map((item) => ({
          id: item.id,
          examType: item.exam_type,
          examinedAt: item.examined_at,
          recordStatus: item.record_status,
        })),
      })),
      transitions: transitions.map((item) => ({
        id: item.id,
        fromEmployeeId: item.from_employee_id,
        toEmployeeId: item.to_employee_id,
        transitionMode: item.transition_mode,
        effectiveDate: item.effective_date,
        status: item.status,
      })),
    };
  }

  async listPendingEmploymentTransitions(): Promise<PendingEmploymentTransition[]> {
    const client = await createDatabaseClient();
    const transitionResponse = await client
      .from("hospital_patient_employment_transitions")
      .select("id,patient_id,from_employee_id,to_employee_id,from_organization_id,to_organization_id,effective_date,created_at")
      .eq("status", "PENDING_ADMIN_REVIEW")
      .order("created_at", { ascending: true });
    assertNoError(transitionResponse.error, "Unable to load pending transfers");
    const TransitionSchema = z.object({
      id: z.string().uuid(), patient_id: z.string().uuid(),
      from_employee_id: z.string().uuid(), to_employee_id: z.string().uuid(),
      from_organization_id: z.string().uuid(), to_organization_id: z.string().uuid(),
      effective_date: z.string(), created_at: z.string(),
    });
    const transitions = z.array(TransitionSchema).parse(transitionResponse.data ?? []);
    if (transitions.length === 0) return [];
    const [employeeResponse, organizationResponse, patientResponse] = await Promise.all([
      client.from("employees").select("id,first_name,last_name").in("id", transitions.flatMap((item) => [item.from_employee_id, item.to_employee_id])),
      client.from("organizations").select("id,name,name_th").in("id", transitions.flatMap((item) => [item.from_organization_id, item.to_organization_id])),
      client.from("hospital_patients").select("id,hospital_number").in("id", transitions.map((item) => item.patient_id)),
    ]);
    assertNoError(employeeResponse.error, "Unable to resolve transfer employees");
    assertNoError(organizationResponse.error, "Unable to resolve transfer organizations");
    assertNoError(patientResponse.error, "Unable to resolve transfer HNs");
    const employees = z.array(z.object({ id: z.string().uuid(), first_name: z.string(), last_name: z.string() })).parse(employeeResponse.data ?? []);
    const organizations = z.array(z.object({ id: z.string().uuid(), name: z.string(), name_th: z.string().nullable() })).parse(organizationResponse.data ?? []);
    const patients = z.array(z.object({ id: z.string().uuid(), hospital_number: z.string() })).parse(patientResponse.data ?? []);
    const organizationLabel = (id: string) => {
      const item = organizations.find((organization) => organization.id === id);
      return item?.name_th ?? item?.name ?? "—";
    };
    return transitions.map((item) => {
      const employee = employees.find((candidate) => candidate.id === item.to_employee_id);
      return {
        id: item.id,
        hospitalNumber: patients.find((patient) => patient.id === item.patient_id)?.hospital_number ?? "—",
        employeeName: employee ? `${employee.first_name} ${employee.last_name}` : "—",
        fromOrganizationName: organizationLabel(item.from_organization_id),
        toOrganizationName: organizationLabel(item.to_organization_id),
        effectiveDate: item.effective_date,
        createdAt: item.created_at,
      };
    });
  }

  async getPriorHistorySnapshot(input: {
    employeeId: string;
    examType: PaperlessAudiogramInput["examType"];
    sourceMonitoringAudiogramId: string | null;
    examinedAt: string;
  }): Promise<PriorHistorySnapshot | null> {
    const client = await createDatabaseClient();
    const currentEmployeeResponse = await client
      .from("employees")
      .select("patient_id,organization_id")
      .eq("id", input.employeeId)
      .maybeSingle();
    assertNoError(currentEmployeeResponse.error, "Unable to resolve current HN");
    const currentEmployee = z.object({
      patient_id: z.string().uuid().nullable(),
      organization_id: z.string().uuid(),
    }).nullable().parse(currentEmployeeResponse.data);
    if (!currentEmployee?.patient_id) return null;
    const patientId = currentEmployee.patient_id;
    const importantHistoryResponse = await client
      .from("hospital_patient_hearing_conditions")
      .select("id,patient_id,category,ear_scope,onset,information_source,details,status,status_reason,recorded_by,recorded_at")
      .eq("patient_id", patientId)
      .eq("status", "ACTIVE")
      .order("category");
    assertNoError(importantHistoryResponse.error, "Unable to load current important hearing history");
    const currentImportantHistory = z.array(ImportantConditionRowSchema)
      .parse(importantHistoryResponse.data ?? [])
      .map(mapImportantCondition);
    const employmentResponse = await client
      .from("hospital_employee_directory")
      .select("id")
      .eq("patient_id", patientId);
    assertNoError(employmentResponse.error, "Unable to resolve authorized HN employments");
    const authorizedEmployeeIds = z.array(z.object({ id: z.string().uuid() }))
      .parse(employmentResponse.data ?? [])
      .map((item) => item.id);
    if (authorizedEmployeeIds.length === 0) return null;

    const loadSnapshot = async (
      audiogramId: string,
      requireSameEmployment = false,
    ): Promise<PriorHistorySnapshot | null> => {
      let recordQuery = client.from("audiograms")
        .select("id,employee_id,exam_type,examined_at,record_status")
        .eq("id", audiogramId)
        .in("employee_id", authorizedEmployeeIds)
        .eq("record_status", "FINAL")
        .lte("examined_at", input.examinedAt);
      if (requireSameEmployment) {
        recordQuery = recordQuery
          .eq("employee_id", input.employeeId)
          .eq("organization_id", currentEmployee.organization_id);
      }
      const [recordResponse, assessmentResponse, historyResponse] = await Promise.all([
        recordQuery.maybeSingle(),
        client.from("audiogram_pretest_assessments")
          .select("audiogram_id")
          .eq("audiogram_id", audiogramId)
          .maybeSingle(),
        client.from("audiogram_history_responses")
          .select("question_code,answer,ear_scope,details")
          .eq("audiogram_id", audiogramId),
      ]);
      assertNoError(recordResponse.error, "Unable to load prior audiogram");
      assertNoError(assessmentResponse.error, "Unable to load prior assessment");
      assertNoError(historyResponse.error, "Unable to load prior history");
      if (!recordResponse.data || !assessmentResponse.data) return null;
      const history = z.array(HistoryRowSchema).parse(historyResponse.data ?? []);
      if (history.length !== 21) return null;
      const record = z.object({
        id: z.string().uuid(),
        employee_id: z.string().uuid(),
        exam_type: ExamTypeSchema,
        examined_at: z.string(),
        record_status: z.literal("FINAL"),
      }).parse(recordResponse.data);
      const responses = history.map((item) => ({
        questionCode: item.question_code as PaperlessAudiogramInput["historyResponses"][number]["questionCode"],
        answer: item.answer,
        earScope: item.ear_scope,
        details: item.details ?? "",
      }));
      return {
        sourceAudiogramId: record.id,
        examinedAt: record.examined_at,
        examType: record.exam_type,
        positiveResponses: responses.filter((item) => item.answer === "YES"),
        priorHearingTestAnswer: responses.find((item) => item.questionCode === "PRIOR_HEARING_TEST")?.answer ?? "UNKNOWN",
        hearingProtectionUseAnswer: responses.find((item) => item.questionCode === "HEARING_PROTECTION_USE")?.answer ?? "UNKNOWN",
        responses,
        importantHistory: currentImportantHistory,
      };
    };

    if ((input.examType === "REPEAT" || input.examType === "CONFIRMATION")
      && input.sourceMonitoringAudiogramId) {
      const monitoringSnapshot = await loadSnapshot(input.sourceMonitoringAudiogramId, true);
      if (monitoringSnapshot) return monitoringSnapshot;
    }

    const assessmentResponse = await client
      .from("audiogram_pretest_assessments")
      .select("audiogram_id")
      .in("employee_id", authorizedEmployeeIds);
    assertNoError(assessmentResponse.error, "Unable to find prior history assessments");
    const eligibleIds = z.array(z.object({ audiogram_id: z.string().uuid() }))
      .parse(assessmentResponse.data ?? [])
      .map((item) => item.audiogram_id);
    if (eligibleIds.length === 0) return null;
    const latestResponse = await client
      .from("audiograms")
      .select("id")
      .in("employee_id", authorizedEmployeeIds)
      .eq("record_status", "FINAL")
      .lt("examined_at", input.examinedAt)
      .in("id", eligibleIds)
      .order("examined_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assertNoError(latestResponse.error, "Unable to select latest prior history");
    if (!latestResponse.data) return null;
    return loadSnapshot(z.string().uuid().parse(latestResponse.data.id));
  }

  async registerEmployee(input: Parameters<PaperlessAudiometryRepository["registerEmployee"]>[0]): Promise<string> {
    const client = await createDatabaseClient();
    const response = await client.rpc("register_hospital_employee", { p_payload: input });
    assertNoError(response.error, "Unable to register hospital employee");
    return z.object({ employeeId: z.string().uuid() }).parse(response.data).employeeId;
  }

  async registerOrganization(
    input: Parameters<PaperlessAudiometryRepository["registerOrganization"]>[0],
  ): Promise<{ organizationId: string; code: string }> {
    const client = await createDatabaseClient();
    const response = await client.rpc("register_hospital_organization", { p_payload: input });
    assertNoError(response.error, "Unable to register organization");
    return z.object({ organizationId: z.string().uuid(), code: z.string() }).parse(response.data);
  }

  async upsertAudiometer(
    input: Parameters<PaperlessAudiometryRepository["upsertAudiometer"]>[0],
  ): Promise<string> {
    const client = await createDatabaseClient();
    const response = await client.rpc("upsert_hospital_audiometer", { p_payload: input });
    assertNoError(response.error, "Unable to save hospital audiometer");
    return z.string().uuid().parse(response.data);
  }

  async manageImportantHearingCondition(
    input: Parameters<PaperlessAudiometryRepository["manageImportantHearingCondition"]>[0],
  ): Promise<string> {
    const client = await createDatabaseClient();
    const response = await client.rpc("manage_patient_hearing_condition", {
      p_employee_id: input.employeeId,
      p_payload: input.condition,
    });
    assertNoError(response.error, "Unable to manage important hearing history");
    return z.string().uuid().parse(response.data);
  }

  async completeEmploymentTransfer(id: string): Promise<void> {
    const client = await createDatabaseClient();
    const response = await client.rpc("complete_employment_transfer", { p_transition_id: id });
    assertNoError(response.error, "Unable to complete employment transfer");
  }

  async saveDraft(id: string | null, input: PaperlessAudiogramInput): Promise<string> {
    const client = await createDatabaseClient();
    const response = await client.rpc("save_paperless_audiogram_draft", {
      p_audiogram_id: id,
      p_payload: input,
    });
    assertNoError(response.error, "Unable to save paperless draft");
    return z.string().uuid().parse(response.data);
  }

  async finalize(
    id: string,
    thaiEvaluation: Parameters<PaperlessAudiometryRepository["finalize"]>[1],
    oshaEvaluation: Parameters<PaperlessAudiometryRepository["finalize"]>[2],
  ): Promise<{ audiogramId: string; followUpCaseId: string | null }> {
    const client = await createDatabaseClient();
    const response = await client.rpc("finalize_paperless_audiogram", {
      p_audiogram_id: id,
      p_thai_evaluation: thaiEvaluation,
      p_osha_evaluation: oshaEvaluation,
    });
    assertNoError(response.error, "Unable to finalize paperless audiogram");
    const result = z.object({
      audiogramId: z.string().uuid(),
      followUpCaseId: z.string().uuid().nullable(),
    }).parse(response.data);
    return result;
  }

  async proposeInitialBaseline(id: string): Promise<string> {
    const client = await createDatabaseClient();
    const response = await client.rpc("propose_initial_thai_baseline", { p_audiogram_id: id });
    assertNoError(response.error, "Unable to propose initial Thai baseline");
    return z.string().uuid().parse(response.data);
  }
}
