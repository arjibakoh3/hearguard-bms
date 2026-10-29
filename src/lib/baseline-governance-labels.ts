import type {
  BaselineReviewStatus,
  BaselineSuggestionType,
} from "@/application/view-models";

const suggestionLabels: Record<BaselineSuggestionType, string> = {
  THAI_INITIAL_BASELINE_CANDIDATE: "Thai initial baseline candidate",
  CURRENT_BASELINE_CONFIRMED: "Current baseline supported",
  OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS: "OSHA persistent STS candidate",
  OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT: "OSHA significant-improvement candidate",
  NIOSH_PERSISTENT_SHIFT_CONFIRMED: "NIOSH persistent shift confirmed",
  NIOSH_SHIFT_NOT_CONFIRMED: "NIOSH shift not confirmed",
  POSSIBLE_MEASUREMENT_VARIABILITY: "Possible measurement variability",
  INSUFFICIENT_DATA: "Insufficient longitudinal data",
};

const reviewLabels: Record<BaselineReviewStatus, string> = {
  PENDING: "รอแพทย์ทบทวน",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  DEFERRED: "เลื่อนการตัดสินใจ",
};

export function baselineSuggestionLabel(value: BaselineSuggestionType): string {
  return suggestionLabels[value];
}

export function baselineReviewLabel(value: BaselineReviewStatus): string {
  return reviewLabels[value];
}

export function baselineReviewBadge(value: BaselineReviewStatus): string {
  switch (value) {
    case "PENDING": return "border-amber-200 bg-amber-50 text-amber-800";
    case "APPROVED": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "REJECTED": return "border-rose-200 bg-rose-50 text-rose-700";
    case "DEFERRED": return "border-sky-200 bg-sky-50 text-sky-700";
  }
}
