import {
  evaluateOshaSts,
  evaluateThaiHearingRule,
  measuredThresholdsFromObservations,
  type Audiogram,
} from "@/domain/hearing";
import type { HearGuardReadService } from "./hearguard-read-service";
import type { HearGuardBaselineGovernanceService } from "./hearguard-baseline-governance-service";
import type { HearGuardNihlEvidenceService } from "./hearguard-nihl-evidence-service";
import {
  CREATABLE_PAPERLESS_EXAM_TYPES,
  PAPERLESS_HISTORY_QUESTIONS,
  PaperlessAudiogramInputSchema,
  type PaperlessAudiogramInput,
  type RegisterHospitalEmployeeInput,
  type UpsertHospitalAudiometerInput,
  type ManageImportantHearingConditionInput,
  ImportantHearingConditionSchema,
} from "./paperless-audiometry-models";
import type { PaperlessAudiometryRepository } from "./ports/paperless-audiometry-repository";

function BangkokDate(isoDateTime: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDateTime));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function assertCreatableExamType(
  id: string | null,
  input: PaperlessAudiogramInput,
): void {
  const isLegacyDraft = id !== null;
  const isLegacyCorrection = input.supersedesAudiogramId !== null;
  if (!CREATABLE_PAPERLESS_EXAM_TYPES.includes(
    input.examType as typeof CREATABLE_PAPERLESS_EXAM_TYPES[number],
  ) && !isLegacyDraft && !isLegacyCorrection) {
    throw new Error("รายการใหม่ให้ใช้ประเภทตรวจซ้ำภายใน 30 วัน; Immediate retest รองรับเฉพาะข้อมูลเดิม");
  }
}

function assertFinalCompleteness(input: PaperlessAudiogramInput): void {
  if (!input.examinerUserId) throw new Error("Final ไม่ได้: กรุณาเลือกผู้ตรวจ");
  if (!input.audiometerId) throw new Error("Final ไม่ได้: กรุณาเลือกเครื่องตรวจ");
  if (input.thresholds.length !== 14) {
    throw new Error("Final ต้องมีสถานะ threshold ครบ 14 จุด");
  }
  const thresholdKeys = new Set(input.thresholds.map((item) => `${item.ear}:${item.frequencyHz}`));
  if (thresholdKeys.size !== 14) throw new Error("Threshold มีจุดซ้ำหรือขาดความถี่");
  for (const observation of input.thresholds) {
    const value = observation.responseStatus === "MEASURED"
      ? observation.thresholdDbHl
      : observation.responseStatus === "NO_RESPONSE"
        ? observation.noResponseAtDbHl
        : null;
    if (value !== null && value % 5 !== 0) {
      throw new Error("ค่าที่กรอกด้วยมือทุกจุดต้องเป็น step 5 dB HL");
    }
  }
  if (input.historyResponses.length !== PAPERLESS_HISTORY_QUESTIONS.length) {
    throw new Error("Final ต้องตอบแบบซักประวัติครบทุกข้อ");
  }
  if (new Set(input.historyResponses.map((item) => item.questionCode)).size !== PAPERLESS_HISTORY_QUESTIONS.length) {
    throw new Error("แบบซักประวัติมีข้อซ้ำหรือไม่ครบ");
  }
  if (input.otoscopyFindings.length !== 2 || new Set(input.otoscopyFindings.map((item) => item.ear)).size !== 2) {
    throw new Error("Final ต้องบันทึกสถานะ otoscopy ของหูซ้ายและขวา");
  }
  if ((input.examType === "REPEAT" || input.examType === "CONFIRMATION")
    && (!input.sourceMonitoringAudiogramId || !input.followUpCaseId)) {
    throw new Error("Immediate retest/Confirmation ต้องเลือก Monitoring และ follow-up case ต้นเหตุ");
  }
}

function oshaSnapshot(baseline: Audiogram | null, current: Audiogram, evaluatedAt: string) {
  const evaluation = evaluateOshaSts(baseline, current, evaluatedAt);
  return {
    ...evaluation,
    explanation: evaluation.status === "not_evaluable"
      ? "Not evaluable because a required 2000/3000/4000 Hz point or valid operational baseline is unavailable."
      : evaluation.status === "positive"
        ? "The average threshold change at 2000/3000/4000 Hz is at least 10 dB in one or both ears."
        : "The 2000/3000/4000 Hz average threshold change is below 10 dB in both ears.",
    recommendedAction: evaluation.status === "positive"
      ? "Review the OSHA result separately; baseline revision requires qualified professional review."
      : "Continue the Thai operational surveillance workflow.",
  };
}

export class HearGuardPaperlessAudiometryService {
  constructor(
    private readonly repository: PaperlessAudiometryRepository,
    private readonly readService: HearGuardReadService,
    private readonly governanceService: HearGuardBaselineGovernanceService,
    private readonly nihlEvidenceService?: Pick<HearGuardNihlEvidenceService, "refreshForEmployee">,
  ) {}

  getWorkspace() {
    return this.repository.getWorkspace();
  }

  getRecord(id: string) {
    return this.repository.getRecord(id);
  }

  lookupPatientEmployments(hospitalNumber: string) {
    const normalized = hospitalNumber.trim();
    if (!/^\d{7}$/.test(normalized)) throw new Error("HN ต้องเป็นตัวเลข 7 หลัก");
    return this.repository.lookupPatientEmployments(normalized);
  }

  getPatientTimeline(patientId: string) {
    return this.repository.getPatientTimeline(patientId);
  }

  getImportantHearingHistory(employeeId: string) {
    return this.repository.getImportantHearingHistory(employeeId);
  }

  listPendingEmploymentTransitions() {
    return this.repository.listPendingEmploymentTransitions();
  }

  getPriorHistorySnapshot(input: {
    employeeId: string;
    examType: PaperlessAudiogramInput["examType"];
    sourceMonitoringAudiogramId: string | null;
    examinedAt: string;
  }) {
    return this.repository.getPriorHistorySnapshot(input);
  }

  registerEmployee(input: RegisterHospitalEmployeeInput) {
    const hospitalNumber = input.hospitalNumber.trim();
    if (!/^\d{7}$/.test(hospitalNumber)) {
      throw new Error("HN ต้องเป็นตัวเลข 7 หลัก รวมเลขศูนย์นำหน้า");
    }
    if (!input.organizationId || !input.employeeNumber.trim()
      || !input.firstName.trim() || !input.lastName.trim()) {
      throw new Error("กรุณาระบุบริษัท รหัสพนักงาน ชื่อ และนามสกุล");
    }
    if (input.transitionMode && !input.effectiveDate) {
      throw new Error("กรุณาระบุวันที่มีผลสำหรับการย้ายหรือทำงานหลายบริษัท");
    }
    return this.repository.registerEmployee({ ...input, hospitalNumber });
  }

  registerOrganization(input: { nameTh: string; name: string | null }) {
    const nameTh = input.nameTh.trim().replace(/\s+/g, " ");
    const name = input.name?.trim().replace(/\s+/g, " ") || null;
    if (!nameTh) throw new Error("กรุณาระบุชื่อบริษัทภาษาไทย");
    if (nameTh.length > 300 || (name?.length ?? 0) > 300) {
      throw new Error("ชื่อบริษัทต้องยาวไม่เกิน 300 ตัวอักษร");
    }
    return this.repository.registerOrganization({ nameTh, name });
  }

  upsertAudiometer(input: UpsertHospitalAudiometerInput) {
    const normalized = {
      ...input,
      displayName: input.displayName.trim(),
      model: input.model.trim(),
      serialNumber: input.serialNumber.trim(),
      location: input.location.trim(),
    };
    if (!normalized.displayName || !normalized.model || !normalized.serialNumber || !normalized.location) {
      throw new Error("กรุณาระบุชื่อเครื่อง รุ่น serial และสถานที่ให้ครบ");
    }
    return this.repository.upsertAudiometer(normalized);
  }

  manageImportantHearingCondition(input: ManageImportantHearingConditionInput) {
    return this.repository.manageImportantHearingCondition({
      employeeId: input.employeeId,
      condition: ImportantHearingConditionSchema.parse(input.condition),
    });
  }

  completeEmploymentTransfer(id: string) {
    return this.repository.completeEmploymentTransfer(id);
  }

  saveDraft(id: string | null, rawInput: PaperlessAudiogramInput) {
    const input = PaperlessAudiogramInputSchema.parse(rawInput);
    assertCreatableExamType(id, input);
    return this.repository.saveDraft(id, input);
  }

  async saveAndFinalize(id: string | null, rawInput: PaperlessAudiogramInput) {
    const input = PaperlessAudiogramInputSchema.parse(rawInput);
    assertCreatableExamType(id, input);
    assertFinalCompleteness(input);
    const draftId = await this.repository.saveDraft(id, input);
    const profile = await this.readService.getEmployeeProfile(input.employeeId);
    if (!profile) throw new Error("ไม่พบพนักงานหรือไม่มีสิทธิ์เข้าถึงข้อมูล");
    if (profile.identity.organizationId !== input.organizationId) {
      throw new Error("บริษัทของแบบตรวจไม่ตรงกับ employee record");
    }

    let thaiEvaluation = null;
    let oshaEvaluation = null;
    if (input.examType !== "BASELINE" && input.examType !== "OTHER") {
      const activeBaselineRecord = profile.activeBaseline
        ? profile.audiograms.find((item) => item.id === profile.activeBaseline?.audiogramId) ?? null
        : null;
      const toDomain = (record: typeof activeBaselineRecord): Audiogram | null => record ? ({
        id: record.id,
        employeeId: profile.identity.id,
        examDate: record.examDate,
        examType: record.examType,
        hoursSinceNoiseExposure: record.hoursSinceNoiseExposure ?? undefined,
        isValid: record.isValid,
        validationNotes: record.validationNotes ?? undefined,
        thresholds: record.thresholds,
      }) : null;
      const current: Audiogram = {
        id: draftId,
        employeeId: input.employeeId,
        examDate: BangkokDate(input.examinedAt),
        examType: input.examType,
        hoursSinceNoiseExposure: input.hoursSinceNoiseExposure ?? undefined,
        isValid: input.isValid,
        validationNotes: input.validationNotes || undefined,
        thresholds: measuredThresholdsFromObservations(input.thresholds),
      };
      const evaluatedAt = new Date().toISOString();
      const baseline = toDomain(activeBaselineRecord);
      thaiEvaluation = evaluateThaiHearingRule(baseline, current, evaluatedAt);
      oshaEvaluation = oshaSnapshot(baseline, current, evaluatedAt);
    }

    const result = await this.repository.finalize(draftId, thaiEvaluation, oshaEvaluation);
    let suggestionsCreated = 0;
    if (["ANNUAL", "REPEAT", "CONFIRMATION"].includes(input.examType)) {
      const refreshedProfile = await this.readService.getEmployeeProfile(input.employeeId);
      if (refreshedProfile) {
        suggestionsCreated = await this.governanceService.prepareSuggestions(refreshedProfile);
      }
    }
    let nihlAssessmentCreated = false;
    if (this.nihlEvidenceService) {
      try {
        nihlAssessmentCreated = Boolean(await this.nihlEvidenceService.refreshForEmployee(
          input.employeeId,
          result.audiogramId,
        ));
      } catch {
        // The finalized clinical record must remain durable even when the
        // separate, non-diagnostic evidence suggestion cannot be refreshed.
      }
    }
    return { ...result, suggestionsCreated, nihlAssessmentCreated };
  }

  async createCorrection(finalRecordId: string): Promise<string> {
    const source = await this.repository.getRecord(finalRecordId);
    if (!source || source.recordStatus !== "FINAL") {
      throw new Error("สร้างฉบับแก้ไขได้เฉพาะ Final record ปัจจุบัน");
    }
    const input: PaperlessAudiogramInput = {
      organizationId: source.organizationId,
      employeeId: source.employeeId,
      examType: source.examType,
      examinedAt: source.examinedAt,
      testContext: source.testContext,
      hoursSinceNoiseExposure: source.hoursSinceNoiseExposure,
      audiometerId: source.audiometerId,
      examinerUserId: source.examinerUserId,
      equipmentCalibrationAcknowledged: source.equipmentCalibrationAcknowledged,
      isValid: source.isValid,
      validationNotes: source.validationNotes,
      sourceMonitoringAudiogramId: source.sourceMonitoringAudiogramId,
      followUpCaseId: source.followUpCaseId,
      supersedesAudiogramId: source.id,
      pretest: {
        ...source.pretest,
        historyCaptureMode: "UNCHANGED_FROM_PRIOR",
        sourceHistoryAudiogramId: source.id,
      },
      importantHistory: {
        captureMode: "COPY_SOURCE",
        sourceAudiogramId: source.id,
        conditions: [],
      },
      historyResponses: PAPERLESS_HISTORY_QUESTIONS.map(({ code }) =>
        source.historyResponses.find((item) => item.questionCode === code) ?? {
          questionCode: code,
          answer: "UNKNOWN" as const,
          earScope: null,
          details: "",
        }),
      otoscopyFindings: (["LEFT", "RIGHT"] as const).map((ear) =>
        source.otoscopyFindings.find((item) => item.ear === ear) ?? {
          ear,
          examinationStatus: "NOT_EXAMINED" as const,
          canalObstruction: false,
          abnormalTympanicMembrane: false,
          perforation: false,
          otherFinding: false,
          notes: "",
        }),
      thresholds: source.thresholds,
    };
    return this.repository.saveDraft(null, input);
  }

  proposeInitialBaseline(id: string) {
    return this.repository.proposeInitialBaseline(id);
  }
}
