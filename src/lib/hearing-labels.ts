import type {
  AudiogramListItem,
  ClinicalResultFilter,
  FollowUpWorkflowFilter,
} from "@/application/view-models";

export const CLINICAL_RESULT_OPTIONS: Array<{
  value: ClinicalResultFilter;
  label: string;
}> = [
  { value: "negative", label: "Stable" },
  { value: "positive", label: "Shift detected" },
  { value: "not_evaluable", label: "Not evaluable" },
  { value: "no_evaluation", label: "No evaluation" },
];

export const FOLLOW_UP_WORKFLOW_OPTIONS: Array<{
  value: FollowUpWorkflowFilter;
  label: string;
}> = [
  { value: "REPEAT_REQUIRED", label: "Repeat required" },
  { value: "PHYSICIAN_REVIEW", label: "Awaiting physician review" },
  { value: "INTERVENTION_REQUIRED", label: "Intervention required" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CLOSED", label: "Closed" },
  { value: "NO_CASE", label: "No case" },
];

export const AUDIOGRAM_TYPE_OPTIONS: Array<{
  value: AudiogramListItem["examType"];
  label: string;
}> = [
  { value: "BASELINE", label: "Baseline" },
  { value: "ANNUAL", label: "Annual monitoring" },
  { value: "REPEAT", label: "Immediate retest (legacy)" },
  { value: "CONFIRMATION", label: "ตรวจซ้ำภายใน 30 วัน" },
  { value: "OTHER", label: "Other" },
];

export function audiogramTypeLabel(
  value: AudiogramListItem["examType"],
): string {
  return (
    AUDIOGRAM_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}
