import { evaluateOshaSts } from "../rules/osha-sts";
import { analyzeNioshPersistence } from "./niosh-persistence-analysis";
import type {
  BaselineSuggestion,
  BaselineSuggestionContext,
} from "./baseline-suggestion-types";

function safetyFields() {
  return {
    automaticBaselineChange: false as const,
    thaiFollowUpMutation: false as const,
  };
}

export function generateBaselineInterpretationSuggestions(
  context: BaselineSuggestionContext,
): BaselineSuggestion[] {
  const suggestions: BaselineSuggestion[] = [];
  const evaluatedAt = `${context.monitoring.examDate}T12:00:00.000Z`;
  const monitoringOsha = evaluateOshaSts(
    context.activeBaseline,
    context.monitoring,
    evaluatedAt,
  );
  const subsequent = context.confirmation ?? context.immediateRetest;
  const subsequentOsha = subsequent
    ? evaluateOshaSts(context.activeBaseline, subsequent, evaluatedAt)
    : null;

  for (const monitoringFinding of monitoringOsha.triggeredFindings) {
    const persistent = subsequentOsha?.triggeredFindings.find(
      (finding) => finding.ear === monitoringFinding.ear,
    );
    if (!persistent || !subsequent) continue;
    suggestions.push({
      framework: "OSHA",
      type: "OSHA_REVISED_BASELINE_CANDIDATE_PERSISTENT_STS",
      qualitativeState: "REVIEW_REQUIRED",
      earScope: monitoringFinding.ear,
      candidateAudiogramId: subsequent.id,
      evidence: {
        monitoringAudiogramId: context.monitoring.id,
        subsequentAudiogramId: subsequent.id,
        frequenciesHz: monitoringFinding.frequenciesHz,
        monitoringAverageDifferenceDb: monitoringFinding.differenceDb,
        subsequentAverageDifferenceDb: persistent.differenceDb,
      },
      explanation: `OSHA STS at 2000/3000/4000 Hz persisted in the ${monitoringFinding.ear.toLowerCase()} ear on subsequent testing.`,
      requiredAction: "Audiologist, otolaryngologist, or physician review is required before any OSHA-style baseline revision.",
      ...safetyFields(),
    });
  }

  if (context.oshaSignificantImprovementDeterminedByProfessional) {
    suggestions.push({
      framework: "OSHA",
      type: "OSHA_REVISED_BASELINE_CANDIDATE_SIGNIFICANT_IMPROVEMENT",
      qualitativeState: "REVIEW_REQUIRED",
      earScope: "BOTH",
      candidateAudiogramId: context.monitoring.id,
      evidence: {
        monitoringAudiogramId: context.monitoring.id,
        professionalObservation:
          context.oshaSignificantImprovementRationale
          ?? "Professional determination supplied without an invented numeric threshold",
      },
      explanation: "A reviewing professional identified significant improvement; the system did not infer a numeric improvement threshold.",
      requiredAction: "Professional review and an explicit approve/reject decision are required.",
      ...safetyFields(),
    });
  }

  const niosh = analyzeNioshPersistence(
    context.activeBaseline,
    context.monitoring,
    context.immediateRetest,
    context.confirmation,
    context.confirmationEvidence,
  );
  const commonNiosh = {
    framework: "NIOSH" as const,
    earScope: "BOTH" as const,
    candidateAudiogramId: context.confirmation?.id ?? null,
    evidence: {
      monitoringAudiogramId: context.monitoring.id,
      immediateRetestAudiogramId: context.immediateRetest?.id ?? null,
      confirmationAudiogramId: context.confirmation?.id ?? null,
      findings: niosh.findings,
      reasons: niosh.reasons,
    },
    requiredAction: "Occupational physician review; do not modify the Thai operational baseline or follow-up case automatically.",
    ...safetyFields(),
  };

  if (niosh.status === "NIOSH_PERSISTENT_SHIFT_CONFIRMED") {
    suggestions.push({
      ...commonNiosh,
      type: "NIOSH_PERSISTENT_SHIFT_CONFIRMED",
      qualitativeState: "REVIEW_REQUIRED",
      explanation: context.immediateRetest
        ? "The qualifying monitoring shift persisted through optional immediate retest and quiet-period confirmation."
        : "The qualifying monitoring shift persisted on direct quiet-period confirmation; no immediate retest was required.",
    });
  } else if (niosh.status === "NIOSH_SHIFT_NOT_CONFIRMED") {
    suggestions.push({
      ...commonNiosh,
      type: "NIOSH_SHIFT_NOT_CONFIRMED",
      qualitativeState: "SUPPORTED_BY_RULE",
      explanation: "The qualifying monitoring shift was not reproduced by the subsequent sequence.",
    });
    if (niosh.interpretationFlags.includes("POSSIBLE_MEASUREMENT_VARIABILITY")) {
      suggestions.push({
        ...commonNiosh,
        type: "POSSIBLE_MEASUREMENT_VARIABILITY",
        qualitativeState: "REVIEW_REQUIRED",
        explanation: "The non-reproduced shift may represent a temporary threshold change or measurement variability.",
      });
    }
  } else if (niosh.status === "INSUFFICIENT_DATA") {
    suggestions.push({
      ...commonNiosh,
      type: "INSUFFICIENT_DATA",
      qualitativeState: "INSUFFICIENT_DATA",
      explanation: niosh.reasons.join("; ") || "The longitudinal sequence is incomplete.",
    });
  } else if (monitoringOsha.status === "negative") {
    suggestions.push({
      framework: "OSHA",
      type: "CURRENT_BASELINE_CONFIRMED",
      qualitativeState: "SUPPORTED_BY_RULE",
      earScope: "BOTH",
      candidateAudiogramId: null,
      evidence: { monitoringAudiogramId: context.monitoring.id },
      explanation: "No OSHA STS or NIOSH qualifying shift was detected in this analytical review.",
      requiredAction: "Continue the Thai operational surveillance workflow.",
      ...safetyFields(),
    });
  }

  return suggestions;
}
