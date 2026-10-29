import type { FollowUpCommandRepository } from "./ports/follow-up-command-repository";
import type { FollowUpCaseStatus } from "./view-models";

const ALLOWED_TRANSITIONS: Record<FollowUpCaseStatus, FollowUpCaseStatus[]> = {
  SHIFT_DETECTED: ["REPEAT_REQUIRED"],
  REPEAT_REQUIRED: ["REPEAT_COMPLETED"],
  REPEAT_COMPLETED: ["PHYSICIAN_REVIEW"],
  PHYSICIAN_REVIEW: ["INTERVENTION_REQUIRED", "FOLLOW_UP", "CLOSED"],
  INTERVENTION_REQUIRED: ["FOLLOW_UP", "CLOSED"],
  FOLLOW_UP: ["PHYSICIAN_REVIEW", "CLOSED"],
  CLOSED: [],
};

export class HearGuardFollowUpService {
  constructor(private readonly repository: FollowUpCommandRepository) {}

  async advanceStatus(
    caseId: string,
    currentStatus: FollowUpCaseStatus,
    newStatus: FollowUpCaseStatus,
  ): Promise<void> {
    if (!ALLOWED_TRANSITIONS[currentStatus].includes(newStatus)) {
      throw new Error(
        `Invalid follow-up transition from ${currentStatus} to ${newStatus}`,
      );
    }

    await this.repository.advanceStatus(caseId, newStatus);
  }
}
