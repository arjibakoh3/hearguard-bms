import type { Audiogram, Ear } from "../types/audiogram";
import type { NioshConfirmationEvidence } from "./niosh-persistence-analysis";

export const BASELINE_SUGGESTION_TYPES = [
  "THAI_INITIAL_BASELINE_CANDIDATE",
  "CURRENT_BASELINE_CONFIRMED",
  "OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS",
  "OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT",
  "NIOSH_PERSISTENT_SHIFT_CONFIRMED",
  "NIOSH_SHIFT_NOT_CONFIRMED",
  "POSSIBLE_MEASUREMENT_VARIABILITY",
  "INSUFFICIENT_DATA",
] as const;

export type BaselineSuggestionType = typeof BASELINE_SUGGESTION_TYPES[number];
export type BaselineSuggestionFramework = "THAI" | "OSHA" | "NIOSH";

export type BaselineSuggestion = {
  framework: BaselineSuggestionFramework;
  type: BaselineSuggestionType;
  qualitativeState: "REVIEW_REQUIRED" | "INSUFFICIENT_DATA" | "SUPPORTED_BY_RULE";
  earScope: Ear | "BOTH";
  candidateAudiogramId: string | null;
  evidence: Record<string, unknown>;
  explanation: string;
  requiredAction: string;
  automaticBaselineChange: false;
  thaiFollowUpMutation: false;
};

export type BaselineSuggestionContext = {
  activeBaseline: Audiogram | null;
  monitoring: Audiogram;
  immediateRetest: Audiogram | null;
  confirmation: Audiogram | null;
  confirmationEvidence: NioshConfirmationEvidence | null;
  oshaSignificantImprovementDeterminedByProfessional?: boolean;
  oshaSignificantImprovementRationale?: string;
};
