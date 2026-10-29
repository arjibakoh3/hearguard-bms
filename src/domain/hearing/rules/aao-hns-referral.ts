import type { AudiogramThresholdObservation, Ear } from "../types/audiogram";

export const AAO_HNS_REFERRAL_RULE_CODE = "AAO_HNS_1983_AUDIOLOGICAL_REFERRAL";
export const AAO_HNS_REFERRAL_RULE_VERSION = "1.0.0";

export type ReferralStatus = "MEETS_CRITERIA" | "DOES_NOT_MEET" | "NOT_EVALUABLE";
export type ReferralCriterionCode = "A.1" | "A.2" | "A.3" | "B.1" | "B.2";

export type ReferralAudiogram = {
  id: string;
  examDate: string;
  examinedAt: string;
  examType: "BASELINE" | "ANNUAL" | "REPEAT" | "CONFIRMATION" | "OTHER";
  isValid: boolean;
  thresholdObservations: readonly AudiogramThresholdObservation[];
};

export type ReferralCriterionResult = {
  code: ReferralCriterionCode;
  status: ReferralStatus;
  frequenciesHz: readonly number[];
  cutoffDb: number;
  earAverages: Array<{
    ear: Ear;
    originalBaselineDbHl: number | null;
    currentDbHl: number | null;
    changeDb: number | null;
  }>;
  interauralDifferenceDb: number | null;
  missingReasons: string[];
};

export type AaoHnsReferralAssessment = {
  ruleCode: typeof AAO_HNS_REFERRAL_RULE_CODE;
  ruleVersion: typeof AAO_HNS_REFERRAL_RULE_VERSION;
  section: "A" | "B" | null;
  status: ReferralStatus;
  currentAudiogramId: string;
  currentExamDate: string;
  originalBaselineAudiogramId: string | null;
  originalBaselineExamDate: string | null;
  criteria: ReferralCriterionResult[];
  reasons: string[];
};

const EARS = ["RIGHT", "LEFT"] as const;
const A1_FREQUENCIES = [500, 1000, 2000, 3000] as const;
const LOW_FREQUENCIES = [500, 1000, 2000] as const;
const HIGH_FREQUENCIES = [3000, 4000, 6000] as const;

const DEFINITIONS: Record<ReferralCriterionCode, { frequenciesHz: readonly number[]; cutoffDb: number }> = {
  "A.1": { frequenciesHz: A1_FREQUENCIES, cutoffDb: 25 },
  "A.2": { frequenciesHz: LOW_FREQUENCIES, cutoffDb: 15 },
  "A.3": { frequenciesHz: HIGH_FREQUENCIES, cutoffDb: 30 },
  "B.1": { frequenciesHz: LOW_FREQUENCIES, cutoffDb: 15 },
  "B.2": { frequenciesHz: HIGH_FREQUENCIES, cutoffDb: 20 },
};

function meanFor(
  record: ReferralAudiogram,
  ear: Ear,
  frequencies: readonly number[],
): number | null {
  const values = frequencies.map((frequency) => {
    const point = record.thresholdObservations.find(
      (item) => item.ear === ear && item.frequencyHz === frequency,
    );
    return point?.responseStatus === "MEASURED" ? point.thresholdDbHl : null;
  });
  return values.some((value) => value === null)
    ? null
    : (values as number[]).reduce((sum, value) => sum + value, 0) / values.length;
}

function missingAt(record: ReferralAudiogram, ear: Ear, frequencies: readonly number[]): string[] {
  return frequencies.flatMap((frequency) => {
    const point = record.thresholdObservations.find(
      (item) => item.ear === ear && item.frequencyHz === frequency,
    );
    if (point?.responseStatus === "MEASURED") return [];
    const condition = point?.responseStatus === "NO_RESPONSE"
      ? `NR @ ${point.noResponseAtDbHl}`
      : point?.responseStatus === "NOT_TESTED" ? "ไม่ได้ทดสอบ" : "ไม่มีข้อมูล";
    return [`${record.id} · ${ear} ${frequency} Hz: ${condition}`];
  });
}

function notEvaluableCriterion(code: ReferralCriterionCode, reason: string): ReferralCriterionResult {
  return {
    code,
    status: "NOT_EVALUABLE",
    ...DEFINITIONS[code],
    earAverages: [],
    interauralDifferenceDb: null,
    missingReasons: [reason],
  };
}

function evaluateSectionA(code: "A.1" | "A.2" | "A.3", baseline: ReferralAudiogram): ReferralCriterionResult {
  const { frequenciesHz, cutoffDb } = DEFINITIONS[code];
  const earAverages = EARS.map((ear) => ({
    ear,
    originalBaselineDbHl: null,
    currentDbHl: meanFor(baseline, ear, frequenciesHz),
    changeDb: null,
  }));
  const missingReasons = EARS.flatMap((ear) => missingAt(baseline, ear, frequenciesHz));
  const measured = earAverages.flatMap((item) => item.currentDbHl === null ? [] : [item.currentDbHl]);
  const interauralDifferenceDb = measured.length === 2
    ? Math.abs(measured[0] - measured[1])
    : null;
  const positive = code === "A.1"
    ? measured.some((value) => value > cutoffDb)
    : interauralDifferenceDb !== null && interauralDifferenceDb > cutoffDb;
  return {
    code,
    frequenciesHz,
    cutoffDb,
    earAverages,
    interauralDifferenceDb: code === "A.1" ? null : interauralDifferenceDb,
    missingReasons,
    status: positive ? "MEETS_CRITERIA" : missingReasons.length ? "NOT_EVALUABLE" : "DOES_NOT_MEET",
  };
}

function evaluateSectionB(
  code: "B.1" | "B.2",
  baseline: ReferralAudiogram,
  current: ReferralAudiogram,
): ReferralCriterionResult {
  const { frequenciesHz, cutoffDb } = DEFINITIONS[code];
  const earAverages = EARS.map((ear) => {
    const originalBaselineDbHl = meanFor(baseline, ear, frequenciesHz);
    const currentDbHl = meanFor(current, ear, frequenciesHz);
    return {
      ear,
      originalBaselineDbHl,
      currentDbHl,
      changeDb: originalBaselineDbHl === null || currentDbHl === null
        ? null : currentDbHl - originalBaselineDbHl,
    };
  });
  const missingReasons = EARS.flatMap((ear) => [
    ...missingAt(baseline, ear, frequenciesHz),
    ...missingAt(current, ear, frequenciesHz),
  ]);
  const positive = earAverages.some((item) => item.changeDb !== null && item.changeDb > cutoffDb);
  return {
    code,
    frequenciesHz,
    cutoffDb,
    earAverages,
    interauralDifferenceDb: null,
    missingReasons,
    status: positive ? "MEETS_CRITERIA" : missingReasons.length ? "NOT_EVALUABLE" : "DOES_NOT_MEET",
  };
}

function overallStatus(criteria: readonly ReferralCriterionResult[]): ReferralStatus {
  if (criteria.some((item) => item.status === "MEETS_CRITERIA")) return "MEETS_CRITERIA";
  if (criteria.some((item) => item.status === "NOT_EVALUABLE")) return "NOT_EVALUABLE";
  return "DOES_NOT_MEET";
}

export function selectOriginalReferralBaseline(records: readonly ReferralAudiogram[]): ReferralAudiogram | null {
  return [...records]
    .filter((item) => item.examType === "BASELINE")
    .sort((left, right) => left.examinedAt.localeCompare(right.examinedAt) || left.id.localeCompare(right.id))[0] ?? null;
}

export function evaluateAaoHnsAudiologicalReferral(
  records: readonly ReferralAudiogram[],
  current: ReferralAudiogram,
): AaoHnsReferralAssessment {
  const original = selectOriginalReferralBaseline(records);
  const section = current.examType === "BASELINE" && original?.id === current.id
    ? "A" as const
    : (["ANNUAL", "REPEAT", "CONFIRMATION"] as const).includes(
      current.examType as "ANNUAL" | "REPEAT" | "CONFIRMATION",
    ) ? "B" as const : null;
  const codes: ReferralCriterionCode[] = section === "A"
    ? ["A.1", "A.2", "A.3"]
    : section === "B" ? ["B.1", "B.2"] : [];
  const reasons: string[] = [];
  if (!section) reasons.push("ประเภทผลตรวจนี้ไม่ใช่ Baseline ครั้งแรกหรือผลตรวจติดตามที่ระบุในเกณฑ์");
  if (!original) reasons.push("ไม่พบ Baseline ครั้งแรกของพนักงาน");
  else if (!original.isValid) reasons.push("Baseline ครั้งแรกถูกระบุว่าไม่ valid");
  if (!current.isValid) reasons.push("ผลตรวจครั้งนี้ถูกระบุว่าไม่ valid");
  if (section === "B" && original && current.examinedAt <= original.examinedAt) {
    reasons.push("ผลตรวจติดตามต้องเกิดหลัง Baseline ครั้งแรก");
  }
  const criteria = codes.map((code) => reasons.length > 0
    ? notEvaluableCriterion(code, reasons.join("; "))
    : section === "A"
      ? evaluateSectionA(code as "A.1" | "A.2" | "A.3", original!)
      : evaluateSectionB(code as "B.1" | "B.2", original!, current));

  return {
    ruleCode: AAO_HNS_REFERRAL_RULE_CODE,
    ruleVersion: AAO_HNS_REFERRAL_RULE_VERSION,
    section,
    status: reasons.length ? "NOT_EVALUABLE" : overallStatus(criteria),
    currentAudiogramId: current.id,
    currentExamDate: current.examDate,
    originalBaselineAudiogramId: original?.id ?? null,
    originalBaselineExamDate: original?.examDate ?? null,
    criteria,
    reasons,
  };
}

export function buildAaoHnsReferralContext(
  records: readonly ReferralAudiogram[],
  current: ReferralAudiogram,
): {
  current: AaoHnsReferralAssessment;
  originalBaseline: AaoHnsReferralAssessment | null;
} {
  const original = selectOriginalReferralBaseline(records);
  return {
    current: evaluateAaoHnsAudiologicalReferral(records, current),
    originalBaseline: original && original.id !== current.id
      ? evaluateAaoHnsAudiologicalReferral(records, original)
      : null,
  };
}
