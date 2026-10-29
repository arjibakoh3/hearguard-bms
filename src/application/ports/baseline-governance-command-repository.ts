import type { BaselineReviewStatus } from "../view-models";
import type {
  BaselineSuggestionFramework,
  BaselineSuggestionType,
} from "@/domain/hearing";

export type BaselineReviewDecision = "APPROVE" | "REJECT" | "DEFER";

export type BaselineReviewResult = {
  suggestionId: string;
  reviewStatus: BaselineReviewStatus;
  newBaselineHistoryId: string | null;
  thaiOperationalBaselineChanged: boolean;
  thaiFollowUpMutated: false;
};

export interface BaselineGovernanceCommandRepository {
  createSuggestions(input: Array<{
    organizationId: string;
    employeeId: string;
    framework: BaselineSuggestionFramework;
    suggestionType: BaselineSuggestionType;
    qualitativeState: "REVIEW_REQUIRED" | "INSUFFICIENT_DATA" | "SUPPORTED_BY_RULE";
    earScope: "LEFT" | "RIGHT" | "BOTH";
    activeBaselineHistoryId: string | null;
    monitoringAudiogramId: string;
    immediateRetestAudiogramId: string | null;
    confirmationAudiogramId: string | null;
    candidateAudiogramId: string | null;
    evidence: Record<string, unknown>;
    explanation: string;
    requiredAction: string;
  }>): Promise<number>;
  reviewSuggestion(
    suggestionId: string,
    decision: BaselineReviewDecision,
    reviewNote: string,
  ): Promise<BaselineReviewResult>;
}
