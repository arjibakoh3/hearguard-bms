import type { AudiogramChartRecord } from "./audiogram-presentation";
import type { EmployeeAudiogramReport, EvaluationSummary, FollowUpSummary, ProfileAudiogram, ReportImportantHearingCondition, ReportNihlReview } from "./view-models";
import type { PaperlessAudiogramRecord } from "./paperless-audiometry-models";
import type { Ear, FrequencyHz } from "@/domain/hearing";
import type { AaoHnsReferralAssessment } from "@/domain/hearing/rules/aao-hns-referral";
import { evaluationEvidence, evaluationRecommendedAction } from "./report-presentation";
import type { ReportSigner } from "./report-signer";

export type AudiogramPrintModel = {
  name: string;
  employeeNumber: string;
  hospitalNumber: string | null;
  organizationName: string;
  departmentName: string | null;
  current: AudiogramChartRecord;
  baseline: AudiogramChartRecord | null;
  examinedAt: string;
  examType: ProfileAudiogram["examType"];
  isValid: boolean;
  validationNotes: string | null;
  recordStatus: PaperlessAudiogramRecord["recordStatus"] | null;
  evaluations: EvaluationSummary[];
  followUp: FollowUpSummary | undefined;
  importantHistory: ReportImportantHearingCondition[] | null;
  importantHistoryPresent: boolean;
  referralScreening: AaoHnsReferralAssessment | null;
  originalBaselineReferralScreening: AaoHnsReferralAssessment | null;
  nihlReview: ReportNihlReview | null;
  signer: ReportSigner | null;
  generatedAt: string;
};

function chartRecord(record: ProfileAudiogram): AudiogramChartRecord {
  return { id: record.id, examDate: record.examDate, thresholds: record.thresholdObservations };
}

export function buildReportPrintModel(report: EmployeeAudiogramReport, signer: ReportSigner | null = null): AudiogramPrintModel {
  return {
    name: `${report.identity.firstName} ${report.identity.lastName}`,
    employeeNumber: report.identity.employeeNumber,
    hospitalNumber: report.identity.hospitalNumber ?? null,
    organizationName: report.identity.organizationName,
    departmentName: report.identity.departmentName,
    current: chartRecord(report.selectedAudiogram),
    baseline: report.baselineAudiogram ? chartRecord(report.baselineAudiogram) : null,
    examinedAt: report.selectedAudiogram.examinedAt,
    examType: report.selectedAudiogram.examType,
    isValid: report.selectedAudiogram.isValid,
    validationNotes: report.selectedAudiogram.validationNotes,
    recordStatus: null,
    evaluations: report.evaluations,
    followUp: report.relatedFollowUp,
    importantHistory: report.importantHearingHistory,
    importantHistoryPresent: report.importantHearingHistory !== null,
    referralScreening: report.referralScreening,
    originalBaselineReferralScreening: report.originalBaselineReferralScreening,
    nihlReview: report.nihlReview,
    signer,
    generatedAt: report.generatedAt,
  };
}

export function buildPaperlessPrintModel(
  record: PaperlessAudiogramRecord,
  baseline: PaperlessAudiogramRecord | null,
  evaluations: EvaluationSummary[],
  report: EmployeeAudiogramReport | null,
  signer: ReportSigner | null = null,
): AudiogramPrintModel {
  return {
    name: record.employeeName,
    employeeNumber: record.employeeNumber,
    hospitalNumber: record.hospitalNumber,
    organizationName: record.organizationName,
    departmentName: record.departmentName,
    current: { id: record.id, examDate: record.examDate, thresholds: record.thresholds },
    baseline: baseline ? { id: baseline.id, examDate: baseline.examDate, thresholds: baseline.thresholds } : null,
    examinedAt: record.examinedAt,
    examType: record.examType,
    isValid: record.isValid,
    validationNotes: record.validationNotes || null,
    recordStatus: record.recordStatus,
    evaluations,
    followUp: report?.relatedFollowUp,
    importantHistory: record.importantHistorySnapshots.map((item) => ({ ...item, id: item.snapshotId })),
    importantHistoryPresent: record.importantHistorySnapshotPresent,
    referralScreening: record.recordStatus === "FINAL" ? report?.referralScreening ?? null : null,
    originalBaselineReferralScreening: record.recordStatus === "FINAL" ? report?.originalBaselineReferralScreening ?? null : null,
    nihlReview: record.recordStatus === "FINAL" && report?.selectedAudiogram.id === record.id
      && report.identity.id === record.employeeId ? report.nihlReview : null,
    signer: record.recordStatus === "FINAL" ? signer : null,
    generatedAt: report?.generatedAt ?? new Date().toISOString(),
  };
}

export function printThresholdLabel(record: AudiogramChartRecord, ear: Ear, frequencyHz: FrequencyHz): string {
  const observation = record.thresholds.find((item) => item.ear === ear && item.frequencyHz === frequencyHz);
  if (!observation) return "Missing";
  if (observation.responseStatus === "NO_RESPONSE") return `NR @ ${observation.noResponseAtDbHl}`;
  if (observation.responseStatus === "NOT_TESTED") return "Not tested";
  return String(observation.thresholdDbHl);
}

// Keep the core page bounded; every shortened value is reproduced in the appendix.
export function compactPrintText(value: string, limit = 60): string {
  const characters = Array.from(value);
  return characters.length <= limit ? value : `${characters.slice(0, limit).join("")}… [รายละเอียดต่อท้าย]`;
}

export function evaluationNeedsAppendix(evaluation: EvaluationSummary): boolean {
  return evaluationEvidence(evaluation).length > 2
    || evaluation.notEvaluableReasons.length > 1
    || Array.from(evaluationRecommendedAction(evaluation) ?? "").length > 100;
}
