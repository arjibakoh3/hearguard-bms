import type { ReferralStatus } from "@/domain/hearing/rules/aao-hns-referral";
import type { ClinicalResultStatus, EvaluationSummary, ReportNihlReview } from "./view-models";

export function reportOutcomeClass(status: ClinicalResultStatus | ReferralStatus): string {
  const tone = status === "positive" || status === "MEETS_CRITERIA" ? "positive"
    : status === "negative" || status === "DOES_NOT_MEET" ? "negative" : "not-evaluable";
  return `hg-report-outcome hg-report-outcome-${tone}`;
}

export function nihlPhysicianDecisionLabel(decision: ReportNihlReview["decision"]): string {
  return NIHL_PHYSICIAN_DECISION_LABELS[decision];
}

export const NIHL_PHYSICIAN_DECISION_LABELS: Record<ReportNihlReview["decision"], string> = {
    AGREE_COMPATIBLE: "เห็นว่าสอดคล้องกับ NIHL",
    MIXED_OR_MULTIFACTORIAL: "มีสาเหตุร่วมกันหรือเกิดจากหลายปัจจัย",
    ALTERNATIVE_CAUSE_MORE_LIKELY: "สาเหตุอื่นมีความเป็นไปได้มากกว่า",
    DEFER_NEED_MORE_DATA: "ชะลอการสรุป ต้องการข้อมูลเพิ่มเติม",
};

export function reportValidityLabel(isValid: boolean): string {
  return isValid ? "ข้อมูลตรวจใช้ได้" : "ข้อมูลตรวจต้องทบทวน";
}

export function reportValidationNotice(
  isValid: boolean,
  validationNotes: string | null,
): { summary: string | null; fullNote: string | null } {
  const fullNote = validationNotes?.trim() || null;
  if (!fullNote) return { summary: null, fullNote: null };
  if (fullNote.includes("14-hour quiet evidence not documented in source")) {
    return {
      summary: "ข้อมูลย้อนหลัง: ไฟล์ต้นฉบับไม่ระบุหลักฐานพักเสียง 14 ชั่วโมงและข้อมูลก่อนตรวจ/ส่องหู",
      fullNote,
    };
  }
  return {
    summary: isValid
      ? "มีหมายเหตุประกอบผลตรวจ โปรดอ่านรายละเอียด"
      : "มีหมายเหตุที่ต้องทบทวนก่อนใช้ผลตรวจ",
    fullNote,
  };
}

function formatDb(value: number): string {
  return String(Number(value.toFixed(2)));
}

function earLabel(ear: "RIGHT" | "LEFT"): string {
  return ear === "RIGHT" ? "หูขวา" : "หูซ้าย";
}

export function evaluationTitle(evaluation: EvaluationSummary): string {
  if (evaluation.ruleCode === "THAI_HEARING_2561") return "เกณฑ์เฝ้าระวังการได้ยินไทย";
  if (evaluation.ruleCode === "OSHA_STS_29_CFR_1910_95") return "OSHA STS · ผลเปรียบเทียบ";
  return evaluation.ruleName;
}

export function evaluationOutcome(evaluation: EvaluationSummary): string {
  if (evaluation.status === "not_evaluable") return "ประเมินไม่ได้";
  if (evaluation.ruleCode === "THAI_HEARING_2561") {
    return evaluation.status === "positive" ? "พบการเปลี่ยนแปลงตามเกณฑ์ไทย" : "ไม่พบการเปลี่ยนแปลงตามเกณฑ์ไทย";
  }
  if (evaluation.ruleCode === "OSHA_STS_29_CFR_1910_95") {
    return evaluation.status === "positive" ? "เข้าเกณฑ์ OSHA STS" : "ไม่เข้าเกณฑ์ OSHA STS";
  }
  return evaluation.status === "positive" ? "เข้าเกณฑ์" : "ไม่เข้าเกณฑ์";
}

export function evaluationEvidence(evaluation: EvaluationSummary): string[] {
  if (evaluation.findings.length > 0) {
    return evaluation.findings.map((finding) => {
      const frequencies = finding.frequenciesHz.map((value) => value.toLocaleString("en-US")).join("/");
      const change = finding.differenceDb > 0 ? `+${formatDb(finding.differenceDb)}` : formatDb(finding.differenceDb);
      return `${earLabel(finding.ear)} ${frequencies} Hz: ${formatDb(finding.baselineDbHl)} → ${formatDb(finding.currentDbHl)} dB HL (เปลี่ยน ${change} dB)`;
    });
  }
  return evaluation.earAverages.map((average) => {
    const frequencies = average.frequenciesHz.map((value) => value.toLocaleString("en-US")).join("/");
    const change = average.differenceDb > 0 ? `+${formatDb(average.differenceDb)}` : formatDb(average.differenceDb);
    return `${earLabel(average.ear)} ${frequencies} Hz: เฉลี่ย ${formatDb(average.baselineDbHl)} → ${formatDb(average.currentDbHl)} dB HL (เปลี่ยน ${change} dB)`;
  });
}

export function evaluationRecommendedAction(evaluation: EvaluationSummary): string | null {
  const action = evaluation.recommendedAction;
  if (!action) return null;
  const knownThaiActions: Record<string, string> = {
    "Repeat audiometry within 30 days and arrange occupational physician review as indicated.": "ตรวจการได้ยินซ้ำภายใน 30 วัน และให้แพทย์อาชีวเวชศาสตร์ทบทวนตามความเหมาะสม",
    "Continue scheduled hearing surveillance.": "ตรวจติดตามการได้ยินตามรอบปกติ",
    "Verify a complete, valid operational baseline and current audiogram before clinical review.": "ตรวจสอบ Baseline และผลตรวจครั้งนี้ให้ครบและใช้ประเมินได้ก่อนให้แพทย์ทบทวน",
  };
  return knownThaiActions[action] ?? action;
}
