import type {
  BaselineGovernanceCommandRepository,
  BaselineReviewDecision,
} from "./ports/baseline-governance-command-repository";
import type { EmployeeProfile, ProfileAudiogram } from "./view-models";
import {
  generateBaselineInterpretationSuggestions,
  type Audiogram,
} from "@/domain/hearing";

export class HearGuardBaselineGovernanceService {
  constructor(
    private readonly repository: BaselineGovernanceCommandRepository,
  ) {}

  async prepareSuggestions(profile: EmployeeProfile): Promise<number> {
    const toDomain = (audiogram: ProfileAudiogram): Audiogram => ({
      id: audiogram.id,
      employeeId: profile.identity.id,
      examDate: audiogram.examDate,
      examType: audiogram.examType,
      hoursSinceNoiseExposure: audiogram.hoursSinceNoiseExposure ?? undefined,
      isValid: audiogram.isValid,
      validationNotes: audiogram.validationNotes ?? undefined,
      thresholds: audiogram.thresholds,
    });
    const baseline = profile.activeBaseline
      ? profile.audiograms.find((item) => item.id === profile.activeBaseline?.audiogramId) ?? null
      : null;
    const monitoring = [...profile.audiograms]
      .reverse()
      .find((item) => item.examType === "ANNUAL");
    if (!monitoring) throw new Error("No annual monitoring audiogram is available");
    const immediateRetest = profile.audiograms.find(
      (item) => item.examType === "REPEAT"
        && item.sourceMonitoringAudiogramId === monitoring.id,
    ) ?? null;
    const confirmation = profile.audiograms.find(
      (item) => item.examType === "CONFIRMATION"
        && item.sourceMonitoringAudiogramId === monitoring.id,
    ) ?? null;
    const suggestions = generateBaselineInterpretationSuggestions({
      activeBaseline: baseline ? toDomain(baseline) : null,
      monitoring: toDomain(monitoring),
      immediateRetest: immediateRetest ? toDomain(immediateRetest) : null,
      confirmation: confirmation ? toDomain(confirmation) : null,
      confirmationEvidence: confirmation?.confirmationEvidence ?? null,
    });

    return this.repository.createSuggestions(suggestions.map((suggestion) => ({
      organizationId: profile.identity.organizationId,
      employeeId: profile.identity.id,
      framework: suggestion.framework,
      suggestionType: suggestion.type,
      qualitativeState: suggestion.qualitativeState,
      earScope: suggestion.earScope,
      activeBaselineHistoryId: profile.activeBaseline?.historyId ?? null,
      monitoringAudiogramId: monitoring.id,
      immediateRetestAudiogramId: immediateRetest?.id ?? null,
      confirmationAudiogramId: confirmation?.id ?? null,
      candidateAudiogramId: suggestion.candidateAudiogramId,
      evidence: suggestion.evidence,
      explanation: suggestion.explanation,
      requiredAction: suggestion.requiredAction,
    })));
  }

  reviewSuggestion(
    suggestionId: string,
    decision: BaselineReviewDecision,
    reviewNote: string,
  ) {
    const normalizedNote = reviewNote.trim();
    if (normalizedNote.length < 8) {
      throw new Error("Physician review note must contain at least 8 characters");
    }
    return this.repository.reviewSuggestion(
      suggestionId,
      decision,
      normalizedNote,
    );
  }
}
