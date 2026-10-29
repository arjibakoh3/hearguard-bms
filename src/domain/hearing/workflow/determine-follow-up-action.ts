import type { HearingRuleEvaluation } from "../types/evaluation";

export type FollowUpAction =
  | {
      action: "CREATE_CASE";
      initialStatus: "REPEAT_REQUIRED";
      repeatDueDate: string;
    }
  | {
      action: "VERIFY_DATA";
      initialStatus: null;
      repeatDueDate: null;
    }
  | {
      action: "NO_CASE";
      initialStatus: null;
      repeatDueDate: null;
    };

function addUtcDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid audiogram exam date: ${date}`);
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function determineFollowUpAction(
  evaluation: HearingRuleEvaluation,
  audiogramExamDate: string,
  repeatDueDays = 30,
): FollowUpAction {
  if (evaluation.status === "positive") {
    return {
      action: "CREATE_CASE",
      initialStatus: "REPEAT_REQUIRED",
      repeatDueDate: addUtcDays(audiogramExamDate, repeatDueDays),
    };
  }

  if (evaluation.status === "not_evaluable") {
    return {
      action: "VERIFY_DATA",
      initialStatus: null,
      repeatDueDate: null,
    };
  }

  return { action: "NO_CASE", initialStatus: null, repeatDueDate: null };
}
