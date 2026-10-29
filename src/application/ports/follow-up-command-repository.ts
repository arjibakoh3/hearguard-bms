import type { FollowUpCaseStatus } from "../view-models";

export interface FollowUpCommandRepository {
  advanceStatus(caseId: string, newStatus: FollowUpCaseStatus): Promise<void>;
}
