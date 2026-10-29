import type {
  ClinicalResultFilter,
  ClinicalResultStatus,
  FollowUpCaseStatus,
  FollowUpWorkflowFilter,
  WorkflowDisplayStage,
} from "./view-models";

export const FOLLOW_UP_CASE_STATUSES = [
  "SHIFT_DETECTED",
  "REPEAT_REQUIRED",
  "REPEAT_COMPLETED",
  "PHYSICIAN_REVIEW",
  "INTERVENTION_REQUIRED",
  "FOLLOW_UP",
  "CLOSED",
] as const satisfies readonly FollowUpCaseStatus[];

export function normalizeClinicalResultStatus(
  value: string | null,
): ClinicalResultStatus | null {
  switch (value?.toUpperCase()) {
    case "POSITIVE":
      return "positive";
    case "NEGATIVE":
      return "negative";
    case "NOT_EVALUABLE":
      return "not_evaluable";
    default:
      return null;
  }
}

export function normalizeFollowUpStatus(
  value: string | null,
): FollowUpCaseStatus | null {
  return FOLLOW_UP_CASE_STATUSES.includes(value as FollowUpCaseStatus)
    ? (value as FollowUpCaseStatus)
    : null;
}

export function workflowDisplayStageFromStatus(
  status: FollowUpCaseStatus,
): WorkflowDisplayStage {
  switch (status) {
    case "SHIFT_DETECTED":
    case "REPEAT_REQUIRED":
      return "REPEAT_REQUIRED";
    case "REPEAT_COMPLETED":
    case "PHYSICIAN_REVIEW":
      return "PHYSICIAN_REVIEW";
    case "INTERVENTION_REQUIRED":
      return "INTERVENTION_REQUIRED";
    case "FOLLOW_UP":
      return "FOLLOW_UP";
    case "CLOSED":
      return "CLOSED";
  }
}

export function nextActionForEmployeeStatus(
  clinicalResult: ClinicalResultStatus | null,
  followUpStatus: FollowUpCaseStatus | null,
): string {
  switch (followUpStatus) {
    case "SHIFT_DETECTED":
    case "REPEAT_REQUIRED":
      return "นัดตรวจการได้ยินซ้ำ";
    case "REPEAT_COMPLETED":
    case "PHYSICIAN_REVIEW":
      return "รอแพทย์อาชีวเวชศาสตร์ทบทวน";
    case "INTERVENTION_REQUIRED":
      return "ดำเนินมาตรการและบันทึกผล";
    case "FOLLOW_UP":
      return "ติดตามตามกำหนด";
    case "CLOSED":
      return "ปิดเคสแล้ว";
    case null:
      break;
  }

  switch (clinicalResult) {
    case "positive":
      return "นัดตรวจการได้ยินซ้ำ";
    case "not_evaluable":
      return "ตรวจสอบ baseline และความครบถ้วนของข้อมูล";
    case "negative":
      return "ตรวจตามรอบประจำปี";
    case null:
      return "ยังไม่มีผลประเมิน Thai Rule";
  }
}

export function legacyEmployeeStatusFilters(value?: string): {
  clinicalResult?: ClinicalResultFilter;
  followUpWorkflow?: FollowUpWorkflowFilter;
} {
  switch (value) {
    case "STABLE":
      return { clinicalResult: "negative" };
    case "NOT_EVALUABLE":
      return { clinicalResult: "not_evaluable" };
    case "REPEAT_REQUIRED":
    case "PHYSICIAN_REVIEW":
    case "INTERVENTION_REQUIRED":
    case "FOLLOW_UP":
    case "CLOSED":
      return { followUpWorkflow: value };
    case "SHIFT_DETECTED":
      return { followUpWorkflow: "REPEAT_REQUIRED" };
    case "REPEAT_COMPLETED":
      return { followUpWorkflow: "PHYSICIAN_REVIEW" };
    default:
      return {};
  }
}
