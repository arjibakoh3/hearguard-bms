import { SUPPORTED_FREQUENCIES_HZ } from "@/domain/hearing";
import type { AudiogramThresholdObservation, Ear, FrequencyHz } from "@/domain/hearing";
import type { EvaluationSummary, ProfileAudiogram } from "./view-models";

export type AudiogramChartRecord = {
  id: string;
  examDate: string;
  thresholds: readonly AudiogramThresholdObservation[];
};

export type AudiogramRecordChartDatum = {
  frequencyHz: FrequencyHz;
  currentLeft: number | null;
  currentRight: number | null;
  baselineLeft: number | null;
  baselineRight: number | null;
};

function measuredObservationAt(
  record: AudiogramChartRecord | null,
  ear: Ear,
  frequencyHz: FrequencyHz,
): number | null {
  const observation = record?.thresholds.find(
    (item) => item.ear === ear && item.frequencyHz === frequencyHz,
  );
  return observation?.responseStatus === "MEASURED"
    ? observation.thresholdDbHl
    : null;
}

export function buildAudiogramRecordChartData(
  current: AudiogramChartRecord,
  baseline: AudiogramChartRecord | null,
  compareBaseline: boolean,
): AudiogramRecordChartDatum[] {
  const comparison = compareBaseline ? baseline : null;
  return SUPPORTED_FREQUENCIES_HZ.map((frequencyHz) => ({
    frequencyHz,
    currentLeft: measuredObservationAt(current, "LEFT", frequencyHz),
    currentRight: measuredObservationAt(current, "RIGHT", frequencyHz),
    baselineLeft: measuredObservationAt(comparison, "LEFT", frequencyHz),
    baselineRight: measuredObservationAt(comparison, "RIGHT", frequencyHz),
  }));
}

function byExaminedAt(left: ProfileAudiogram, right: ProfileAudiogram): number {
  const timeDifference = new Date(left.examinedAt).getTime() - new Date(right.examinedAt).getTime();
  return timeDifference || left.id.localeCompare(right.id);
}

export function sortAudiogramsChronologically(audiograms: ProfileAudiogram[]) {
  return [...audiograms].sort(byExaminedAt);
}

export function getHearingTrajectorySequence(audiograms: ProfileAudiogram[]) {
  return sortAudiogramsChronologically(audiograms).filter((item) => item.isValid);
}

export function getAudiogramComparisonSelection(audiograms: ProfileAudiogram[]) {
  const valid = getHearingTrajectorySequence(audiograms);
  const baseline = valid.find((item) => item.isActiveBaseline) ?? null;
  const latest = valid.at(-1) ?? null;
  const candidates = valid
    .filter((item) => item.id !== baseline?.id && item.id !== latest?.id)
    .filter((item) => !baseline || byExaminedAt(item, baseline) >= 0)
    .sort((left, right) => byExaminedAt(right, left));

  return { baseline, latest, candidates };
}

export function groupAudiogramsByBuddhistYear(audiograms: ProfileAudiogram[]) {
  const grouped = new Map<number, ProfileAudiogram[]>();
  for (const audiogram of [...audiograms].sort((left, right) => byExaminedAt(right, left))) {
    const buddhistYear = Number(audiogram.examDate.slice(0, 4)) + 543;
    grouped.set(buddhistYear, [...(grouped.get(buddhistYear) ?? []), audiogram]);
  }
  return [...grouped.entries()].map(([year, records]) => ({ year, records }));
}

export function toggleOptionalAudiogram(selectedIds: string[], id: string, limit = 3) {
  if (selectedIds.includes(id)) return selectedIds.filter((selectedId) => selectedId !== id);
  if (selectedIds.length >= limit) return selectedIds;
  return [...selectedIds, id];
}

export function getLatestRuleEvaluation(
  audiograms: ProfileAudiogram[],
  evaluations: EvaluationSummary[],
  ruleCode: string,
): EvaluationSummary | null {
  const examById = new Map(audiograms.map((audiogram) => [audiogram.id, audiogram]));
  return evaluations
    .filter((evaluation) => evaluation.ruleCode === ruleCode)
    .sort((left, right) => {
      const leftExam = examById.get(left.currentAudiogramId);
      const rightExam = examById.get(right.currentAudiogramId);
      return (rightExam?.examDate ?? "").localeCompare(leftExam?.examDate ?? "")
        || (rightExam?.examinedAt ?? "").localeCompare(leftExam?.examinedAt ?? "")
        || right.evaluatedAt.localeCompare(left.evaluatedAt)
        || right.id.localeCompare(left.id);
    })[0] ?? null;
}

function getPersistedReportEvaluations(
  evaluations: EvaluationSummary[],
  audiogramId: string,
): EvaluationSummary[] {
  const selectedEvaluations: EvaluationSummary[] = [];
  for (const evaluation of evaluations) {
    if (
      evaluation.currentAudiogramId === audiogramId
      && ["THAI_HEARING_2561", "OSHA_STS_29_CFR_1910_95"].includes(evaluation.ruleCode)
      && !selectedEvaluations.some((item) => item.ruleCode === evaluation.ruleCode)
    ) {
      selectedEvaluations.push(evaluation);
    }
  }
  return selectedEvaluations;
}

export function getPersistedBaselineAudiogramId(
  evaluations: EvaluationSummary[],
  audiogramId: string,
): string | null {
  const selectedEvaluations = getPersistedReportEvaluations(evaluations, audiogramId);
  const thaiEvaluation = selectedEvaluations.find((item) => item.ruleCode === "THAI_HEARING_2561");
  const oshaEvaluation = selectedEvaluations.find((item) => item.ruleCode === "OSHA_STS_29_CFR_1910_95");
  return thaiEvaluation?.baselineAudiogramId
    ?? oshaEvaluation?.baselineAudiogramId
    ?? null;
}

export function getPersistedReportContext(
  audiograms: ProfileAudiogram[],
  evaluations: EvaluationSummary[],
  selectedAudiogram: ProfileAudiogram,
) {
  const selectedEvaluations = getPersistedReportEvaluations(evaluations, selectedAudiogram.id);
  const baselineAudiogramId = getPersistedBaselineAudiogramId(
    selectedEvaluations,
    selectedAudiogram.id,
  );

  return {
    evaluations: selectedEvaluations,
    baselineAudiogram: baselineAudiogramId
      ? audiograms.find((item) => item.id === baselineAudiogramId) ?? null
      : null,
    monitoringAudiogramId: selectedAudiogram.sourceMonitoringAudiogramId
      ?? selectedAudiogram.id,
  };
}
