import "server-only";

import { z } from "zod";
import type {
  AudiogramThresholdObservation,
  NihlAlternativeContributor,
  NihlAudiogramSnapshot,
  NihlEvidenceResult,
  NoiseExposurePeriodEvidence,
} from "@/domain/hearing";
import type {
  NihlEvidenceWorkspace,
  NihlPhysicianReviewInput,
  NoiseExposurePeriodInput,
  NihlPhysicianReview,
  NihlReviewAmendmentInput,
  NihlReviewAmendmentResult,
} from "@/application/nihl-evidence-models";
import { NihlReviewConflictError } from "@/application/nihl-evidence-models";
import type { NihlEvidenceRepository } from "@/application/ports/nihl-evidence-repository";
import { createDatabaseClient } from "@/infrastructure/postgres/server-client";

const DatabaseNumber = z.union([z.number(), z.string().transform(Number)]);
const NullableDatabaseNumber = DatabaseNumber.nullable();

const IdentityRow = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid().nullable(),
  organization_id: z.string().uuid(),
  employee_number: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  job_title: z.string().nullable(),
  organizations: z.object({ name: z.string() }),
  hospital_patients: z.object({ hospital_number: z.string() }).nullable(),
});

const ThresholdRow = z.object({
  ear: z.enum(["LEFT", "RIGHT"]),
  frequency_hz: z.union([z.literal(500), z.literal(1000), z.literal(2000), z.literal(3000), z.literal(4000), z.literal(6000), z.literal(8000)]),
  response_status: z.enum(["MEASURED", "NO_RESPONSE", "NOT_TESTED"]),
  threshold_db_hl: NullableDatabaseNumber,
  no_response_at_db_hl: NullableDatabaseNumber,
});

const AudiogramRow = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  examined_at: z.string(),
  is_valid: z.boolean(),
  audiogram_thresholds: z.array(ThresholdRow),
});

const SourceRow = z.object({
  id: z.string().uuid(),
  metric: z.enum(["LEX_8H", "LAEQ_TE", "DAILY_DOSE"]),
  level_db_a: NullableDatabaseNumber,
  dose_percent: NullableDatabaseNumber,
  measurement_duration_hours: NullableDatabaseNumber,
  exchange_rate_db: NullableDatabaseNumber,
  criterion_level_db_a: NullableDatabaseNumber,
  quality: z.enum(["HIGH", "MODERATE", "LOW", "UNKNOWN"]),
  measurement_kind: z.enum(["PERSONAL_DOSIMETRY", "AREA_MEASUREMENT", "REPRESENTATIVE_JOB_GROUP", "RECORD_REVIEW", "PATIENT_RECALL"]),
});

const ProtectionRow = z.object({
  attenuation_method: z.enum(["PAR", "NRR", "NONE", "UNKNOWN"]),
  attenuation_db: NullableDatabaseNumber,
  wearing_time_percent: NullableDatabaseNumber,
});

const PeriodRow = z.object({
  id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  hours_per_day: NullableDatabaseNumber,
  days_per_week: NullableDatabaseNumber,
  weeks_per_year: NullableDatabaseNumber,
  exposure_pattern: z.enum(["CONTINUOUS", "INTERMITTENT", "FLUCTUATING", "IMPULSE", "MIXED", "UNKNOWN"]),
  impulse_noise: z.boolean(),
  patient_noise_exposure_sources: z.array(SourceRow),
  patient_hearing_protection_periods: z.array(ProtectionRow),
});

const ImportantConditionRow = z.object({
  category: z.string(),
  ear_scope: z.enum(["LEFT", "RIGHT", "BOTH", "UNKNOWN"]),
  information_source: z.string(),
  details: z.string().nullable(),
});

const HistoryRow = z.object({
  question_code: z.string(),
  answer: z.enum(["YES", "NO", "UNKNOWN"]),
  ear_scope: z.enum(["LEFT", "RIGHT", "BOTH"]).nullable(),
  details: z.string().nullable(),
});

const OtoscopyRow = z.object({
  ear: z.enum(["LEFT", "RIGHT"]),
  examination_status: z.enum(["NORMAL", "ABNORMAL", "NOT_EXAMINED"]),
  canal_obstruction: z.boolean(),
  abnormal_tympanic_membrane: z.boolean(),
  perforation: z.boolean(),
  other_finding: z.boolean(),
  notes: z.string().nullable(),
});

const ReviewRow = z.object({
  id: z.string().uuid(),
  decision: z.enum(["AGREE_COMPATIBLE", "MIXED_OR_MULTIFACTORIAL", "ALTERNATIVE_CAUSE_MORE_LIKELY", "DEFER_NEED_MORE_DATA"]),
  review_note: z.string(),
  reviewed_by: z.string().uuid(),
  reviewed_at: z.string(),
  revision: z.number().int().positive(),
  amended_at: z.string().nullable(),
  nihl_physician_review_revisions: z.array(z.object({
    revision: z.number().int().positive(),
    decision: z.enum(["AGREE_COMPATIBLE", "MIXED_OR_MULTIFACTORIAL", "ALTERNATIVE_CAUSE_MORE_LIKELY", "DEFER_NEED_MORE_DATA"]),
    review_note: z.string(),
    recorded_by: z.string().uuid(),
    recorded_at: z.string(),
  })),
});

const ASSESSMENT_COLUMNS = "id,current_audiogram_id,qualitative_state,completeness,evidence_json,created_at,nihl_physician_reviews(id,decision,review_note,reviewed_by,reviewed_at,revision,amended_at,nihl_physician_review_revisions(revision,decision,review_note,recorded_by,recorded_at))";

function mapReview(row: z.infer<typeof ReviewRow> | null): NihlPhysicianReview | null {
  return row ? {
    id: row.id, decision: row.decision, reviewNote: row.review_note,
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
    revision: row.revision, amendedAt: row.amended_at,
    revisions: row.nihl_physician_review_revisions.map((item) => ({
      revision: item.revision, decision: item.decision, reviewNote: item.review_note,
      recordedBy: item.recorded_by, recordedAt: item.recorded_at,
    })).sort((a, b) => b.revision - a.revision),
  } : null;
}

const AssessmentRow = z.object({
  id: z.string().uuid(),
  current_audiogram_id: z.string().uuid(),
  qualitative_state: z.enum(["EXPOSURE_AND_PATTERN_COMPATIBLE", "COMPATIBLE_WITH_MIXED_FACTORS", "ATYPICAL_FEATURES_PRESENT", "CURRENT_EVIDENCE_NOT_SUPPORTIVE", "INSUFFICIENT_DATA"]),
  completeness: z.enum(["COMPLETE", "PARTIAL", "ACCESS_LIMITED"]),
  evidence_json: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  // The unique assessment_id foreign key makes this an inferred one-to-one
  // PostgREST relationship, so Postgres returns an object (or null), not an array.
  nihl_physician_reviews: ReviewRow.nullable(),
});

function assertNoError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function mapObservation(row: z.infer<typeof ThresholdRow>): AudiogramThresholdObservation {
  if (row.response_status === "MEASURED" && row.threshold_db_hl !== null) {
    return { ear: row.ear, frequencyHz: row.frequency_hz, responseStatus: "MEASURED", thresholdDbHl: row.threshold_db_hl };
  }
  if (row.response_status === "NO_RESPONSE" && row.no_response_at_db_hl !== null) {
    return { ear: row.ear, frequencyHz: row.frequency_hz, responseStatus: "NO_RESPONSE", noResponseAtDbHl: row.no_response_at_db_hl };
  }
  return { ear: row.ear, frequencyHz: row.frequency_hz, responseStatus: "NOT_TESTED" };
}

function mapAudiogram(row: z.infer<typeof AudiogramRow>): NihlAudiogramSnapshot {
  return {
    id: row.id,
    employeeId: row.employee_id,
    examinedAt: row.examined_at,
    isValid: row.is_valid,
    observations: row.audiogram_thresholds.map(mapObservation),
  };
}

const historyLabels: Record<string, string> = {
  DIZZINESS: "เวียนศีรษะหรือเสียการทรงตัว",
  EAR_PAIN: "ปวดหู",
  EAR_FULLNESS: "แน่นหู/หูอื้อ",
  SUDDEN_HEARING_CHANGE: "การได้ยินเปลี่ยนเฉียบพลัน",
  EAR_INFECTION_OR_DISEASE: "โรคหรือติดเชื้อเกี่ยวกับหู",
  EAR_SURGERY: "ประวัติผ่าตัดหู",
  HEAD_INJURY_OR_UNCONSCIOUSNESS: "บาดเจ็บศีรษะหรือหมดสติ",
  FAMILY_HEARING_LOSS: "การสูญเสียการได้ยินในครอบครัว",
  OTOTOXIC_MEDICATION: "ยาที่อาจมีพิษต่อหู",
  OTOTOXIC_CHEMICAL_OR_SOLVENT: "สารเคมี/ตัวทำละลายที่อาจมีพิษต่อหู",
  NOISY_HOBBY: "กิจกรรมเสียงดังนอกงาน",
  FIREARMS: "ประวัติใช้อาวุธปืน",
  MILITARY_SERVICE: "ประวัติรับราชการทหาร",
};

export class PostgresNihlEvidenceRepository implements NihlEvidenceRepository {
  async getWorkspace(employeeId: string, currentAudiogramId?: string | null): Promise<NihlEvidenceWorkspace | null> {
    const client = await createDatabaseClient();
    const identityResponse = await client.from("employees")
      .select("id,patient_id,organization_id,employee_number,first_name,last_name,job_title,organizations(name),hospital_patients(hospital_number)")
      .eq("id", employeeId)
      .maybeSingle();
    assertNoError(identityResponse.error, "Unable to load NIHL employee identity");
    if (!identityResponse.data) return null;
    const identity = IdentityRow.parse(identityResponse.data);
    if (Boolean(identity.patient_id) !== Boolean(identity.hospital_patients)) {
      throw new Error("Hospital patient linkage is inconsistent");
    }
    const hasHospitalIdentity = Boolean(identity.patient_id && identity.hospital_patients);
    let accessLimited = false;
    let employeeIds = [employeeId];
    if (hasHospitalIdentity) {
      const lookupResponse = await client.rpc("lookup_hospital_patient_employments", {
        p_hospital_number: identity.hospital_patients!.hospital_number,
      });
      assertNoError(lookupResponse.error, "Unable to resolve longitudinal HN scope");
      accessLimited = z.object({ hasHiddenEmployment: z.boolean() }).parse(lookupResponse.data).hasHiddenEmployment;
      const employmentsResponse = await client.from("employees").select("id").eq("patient_id", identity.patient_id!);
      assertNoError(employmentsResponse.error, "Unable to load accessible HN employments");
      employeeIds = z.array(z.object({ id: z.string().uuid() })).parse(employmentsResponse.data ?? []).map((item) => item.id);
      if (!employeeIds.includes(employeeId)) employeeIds.push(employeeId);
    }

    const periodColumns = "id,start_date,end_date,hours_per_day,days_per_week,weeks_per_year,exposure_pattern,impulse_noise,patient_noise_exposure_sources(id,metric,level_db_a,dose_percent,measurement_duration_hours,exchange_rate_db,criterion_level_db_a,quality,measurement_kind),patient_hearing_protection_periods(attenuation_method,attenuation_db,wearing_time_percent)";
    const [patientPeriodResponse, employeePeriodResponse, audiogramResponse, conditionResponse] = await Promise.all([
      hasHospitalIdentity
        ? client.from("patient_noise_exposure_periods").select(periodColumns)
          .eq("patient_id", identity.patient_id!).eq("status", "ACTIVE")
          .order("start_date", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      client.from("patient_noise_exposure_periods").select(periodColumns)
        .is("patient_id", null).in("employee_id", employeeIds)
        .eq("status", "ACTIVE").order("start_date", { ascending: true }),
      client.from("audiograms")
        .select("id,employee_id,examined_at,is_valid,audiogram_thresholds(ear,frequency_hz,response_status,threshold_db_hl,no_response_at_db_hl)")
        .in("employee_id", employeeIds)
        .eq("record_status", "FINAL")
        .order("examined_at", { ascending: true }),
      hasHospitalIdentity
        ? client.from("hospital_patient_hearing_conditions")
          .select("category,ear_scope,information_source,details")
          .eq("patient_id", identity.patient_id!).eq("status", "ACTIVE")
        : Promise.resolve({ data: [], error: null }),
    ]);
    assertNoError(patientPeriodResponse.error, "Unable to load HN noise exposure");
    assertNoError(employeePeriodResponse.error, "Unable to load employee noise exposure");
    assertNoError(audiogramResponse.error, "Unable to load longitudinal audiograms");
    assertNoError(conditionResponse.error, "Unable to load important hearing history");

    const audiogramRows = z.array(AudiogramRow).parse(audiogramResponse.data ?? []);
    const audiograms = audiogramRows.map(mapAudiogram);
    const requested = currentAudiogramId
      ? audiograms.find((item) => item.id === currentAudiogramId && item.isValid) ?? null
      : null;
    const currentAudiogram = requested ?? [...audiograms]
      .filter((item) => item.isValid && item.employeeId === employeeId)
      .sort((left, right) => right.examinedAt.localeCompare(left.examinedAt))[0] ?? null;

    const [historyResponse, otoscopyResponse, assessmentResponse, priorAssessmentsResponse] = currentAudiogram
      ? await Promise.all([
          client.from("audiogram_history_responses")
            .select("question_code,answer,ear_scope,details")
            .eq("audiogram_id", currentAudiogram.id)
            .eq("answer", "YES"),
          client.from("audiogram_otoscopy_findings")
            .select("ear,examination_status,canal_obstruction,abnormal_tympanic_membrane,perforation,other_finding,notes")
            .eq("audiogram_id", currentAudiogram.id),
          client.from("nihl_evidence_assessments")
            .select(ASSESSMENT_COLUMNS)
            .eq("current_audiogram_id", currentAudiogram.id)
            .eq("record_status", "CURRENT")
            .maybeSingle(),
          client.from("nihl_evidence_assessments")
            .select(ASSESSMENT_COLUMNS)
            .eq("current_audiogram_id", currentAudiogram.id)
            .eq("record_status", "SUPERSEDED")
            .order("created_at", { ascending: false }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: null, error: null }, { data: [], error: null }];
    assertNoError(historyResponse.error, "Unable to load NIHL history context");
    assertNoError(otoscopyResponse.error, "Unable to load otoscopy context");
    assertNoError(assessmentResponse.error, "Unable to load NIHL assessment");
    assertNoError(priorAssessmentsResponse.error, "Unable to load NIHL assessment history");

    const alternatives: NihlAlternativeContributor[] = z.array(ImportantConditionRow)
      .parse(conditionResponse.data ?? [])
      .map((row) => ({
        code: row.category,
        label: row.details || row.category.replaceAll("_", " "),
        earScope: row.ear_scope,
        source: row.information_source,
      }));
    for (const row of z.array(HistoryRow).parse(historyResponse.data ?? [])) {
      const label = historyLabels[row.question_code];
      if (label) alternatives.push({ code: row.question_code, label: row.details ? `${label}: ${row.details}` : label, earScope: row.ear_scope, source: "CURRENT_AUDIOGRAM_HISTORY" });
    }
    for (const row of z.array(OtoscopyRow).parse(otoscopyResponse.data ?? [])) {
      if (row.examination_status === "ABNORMAL") {
        alternatives.push({ code: "ABNORMAL_OTOSCOPY", label: row.notes || "Otoscopy ผิดปกติ", earScope: row.ear, source: "CURRENT_OTOSCOPY" });
      }
    }

    const periodRows = [
      ...z.array(PeriodRow).parse(patientPeriodResponse.data ?? []),
      ...z.array(PeriodRow).parse(employeePeriodResponse.data ?? []),
    ].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const exposurePeriods: NoiseExposurePeriodEvidence[] = periodRows.map((row) => ({
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      hoursPerDay: row.hours_per_day,
      daysPerWeek: row.days_per_week,
      weeksPerYear: row.weeks_per_year,
      pattern: row.exposure_pattern,
      impulseNoise: row.impulse_noise,
      sources: row.patient_noise_exposure_sources.map((source) => ({
        id: source.id,
        metric: source.metric,
        levelDbA: source.level_db_a,
        dosePercent: source.dose_percent,
        measurementDurationHours: source.measurement_duration_hours,
        exchangeRateDb: source.exchange_rate_db,
        criterionLevelDbA: source.criterion_level_db_a,
        quality: source.quality,
        sourceType: source.measurement_kind,
      })),
      hearingProtection: row.patient_hearing_protection_periods.map((protection) => ({
        attenuationMethod: protection.attenuation_method,
        attenuationDb: protection.attenuation_db,
        wearingTimePercent: protection.wearing_time_percent,
      })),
    }));

    const assessmentRow = assessmentResponse.data ? AssessmentRow.parse(assessmentResponse.data) : null;
    const review = assessmentRow?.nihl_physician_reviews ?? null;
    const priorAssessmentRows = z.array(AssessmentRow).parse(priorAssessmentsResponse.data ?? []);
    return {
      identity: {
        employeeId: identity.id,
        patientId: identity.patient_id,
        hospitalNumber: identity.hospital_patients?.hospital_number ?? null,
        identityScope: hasHospitalIdentity ? "HN_LINKED" : "EMPLOYEE_ONLY",
        employeeNumber: identity.employee_number,
        fullName: `${identity.first_name} ${identity.last_name}`,
        organizationId: identity.organization_id,
        organizationName: identity.organizations.name,
        jobTitle: identity.job_title,
      },
      exposurePeriods,
      audiograms,
      currentAudiogram,
      alternativeContributors: alternatives,
      accessLimited,
      latestAssessment: assessmentRow ? {
        id: assessmentRow.id,
        currentAudiogramId: assessmentRow.current_audiogram_id,
        state: assessmentRow.qualitative_state,
        completeness: assessmentRow.completeness,
        result: assessmentRow.evidence_json as unknown as NihlEvidenceResult,
        createdAt: assessmentRow.created_at,
        review: mapReview(review),
      } : null,
      assessmentHistory: priorAssessmentRows.filter((row) => row.nihl_physician_reviews).map((row) => ({
        id: row.id,
        currentAudiogramId: row.current_audiogram_id,
        state: row.qualitative_state,
        completeness: row.completeness,
        result: row.evidence_json as unknown as NihlEvidenceResult,
        createdAt: row.created_at,
        review: mapReview(row.nihl_physician_reviews),
      })),
    };
  }

  async saveExposurePeriod(input: NoiseExposurePeriodInput): Promise<string> {
    const client = await createDatabaseClient();
    const identityResponse = await client.from("employees").select("patient_id")
      .eq("id", input.employeeId).maybeSingle();
    assertNoError(identityResponse.error, "Unable to resolve NIHL exposure identity scope");
    if (!identityResponse.data) throw new Error("NIHL employee is unavailable");
    const scope = z.object({ patient_id: z.string().uuid().nullable() }).parse(identityResponse.data);
    const response = await client.rpc(scope.patient_id
      ? "save_patient_noise_exposure_period"
      : "save_employee_noise_exposure_period", { p_payload: input });
    assertNoError(response.error, "Unable to save noise exposure");
    return z.string().uuid().parse(response.data);
  }

  async persistAssessment(employeeId: string, audiogramId: string, result: NihlEvidenceResult): Promise<string> {
    const client = await createDatabaseClient();
    const identityResponse = await client.from("employees").select("patient_id")
      .eq("id", employeeId).maybeSingle();
    assertNoError(identityResponse.error, "Unable to resolve NIHL assessment identity scope");
    if (!identityResponse.data) throw new Error("NIHL employee is unavailable");
    const scope = z.object({ patient_id: z.string().uuid().nullable() }).parse(identityResponse.data);
    if ((scope.patient_id ? "HN_LINKED" : "EMPLOYEE_ONLY") !== result.identityScope) {
      throw new Error("NIHL identity scope changed; reload before saving the snapshot");
    }
    const response = await client.rpc(scope.patient_id
      ? "persist_nihl_evidence_assessment"
      : "persist_employee_nihl_evidence_assessment", {
      p_employee_id: employeeId,
      p_current_audiogram_id: audiogramId,
      p_result: {
        ...result,
        automaticDiagnosis: false,
        automaticBaselineChange: false,
        thaiFollowUpMutation: false,
      },
    });
    assertNoError(response.error, "Unable to persist NIHL evidence assessment");
    return z.string().uuid().parse(response.data);
  }

  async reviewAssessment(input: NihlPhysicianReviewInput): Promise<string> {
    const client = await createDatabaseClient();
    const response = await client.rpc("review_nihl_evidence_assessment", {
      p_assessment_id: input.assessmentId,
      p_decision: input.decision,
      p_review_note: input.reviewNote,
    });
    assertNoError(response.error, "Unable to save NIHL physician review");
    return z.string().uuid().parse(response.data);
  }

  async amendReview(input: NihlReviewAmendmentInput): Promise<NihlReviewAmendmentResult> {
    const client = await createDatabaseClient();
    const response = await client.rpc("amend_nihl_physician_review", {
      p_review_id: input.reviewId, p_employee_id: input.employeeId,
      p_expected_revision: input.expectedRevision, p_decision: input.decision,
      p_review_note: input.reviewNote,
    });
    if (response.error?.code === "P0001" && response.error.message.startsWith("NIHL_REVIEW_CONFLICT:")) throw new NihlReviewConflictError();
    if (response.error?.code === "42501") throw new Error("แก้ไขได้เฉพาะแพทย์ผู้บันทึกเดิมที่ยังมีสิทธิ์ดูแลบริษัท และรีวิวต้องเป็นฉบับปัจจุบัน");
    assertNoError(response.error, "Unable to amend NIHL physician review");
    return z.object({ reviewId: z.string().uuid(), audiogramId: z.string().uuid(), revision: z.number().int().positive() }).parse(response.data);
  }
}
