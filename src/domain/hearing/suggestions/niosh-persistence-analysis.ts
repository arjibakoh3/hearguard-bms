import { compareAudiograms } from "../calculations/compare-audiograms";
import type { Audiogram, Ear, FrequencyHz } from "../types/audiogram";

const NIOSH_ANALYTICAL_FREQUENCIES = [
  500, 1000, 2000, 3000, 4000, 6000,
] as const satisfies readonly FrequencyHz[];
const NIOSH_SHIFT_DB = 15;
const NIOSH_CONFIRMATION_DAYS = 30;
const NIOSH_CONFIRMATION_QUIET_HOURS = 12;

export type NioshConfirmationEvidenceAnswer = "YES" | "NO" | "UNKNOWN";

export type NioshConfirmationEvidence = {
  quietPeriodAnswer: NioshConfirmationEvidenceAnswer;
  quietPeriodHours: number | null;
  highNonoccupationalNoise: NioshConfirmationEvidenceAnswer;
  hearingProtectionUsedAsSubstitute: NioshConfirmationEvidenceAnswer;
};

export type NioshConfirmationEvidenceAssessment = {
  status: "ELIGIBLE" | "NOT_ELIGIBLE" | "INSUFFICIENT_DATA";
  reasons: string[];
};

export function assessNioshConfirmationEvidence(
  evidence: NioshConfirmationEvidence | null,
): NioshConfirmationEvidenceAssessment {
  if (evidence === null) {
    return {
      status: "INSUFFICIENT_DATA",
      reasons: ["Confirmation quiet-period documentation is unavailable"],
    };
  }

  const failures: string[] = [];
  const incomplete: string[] = [];

  if (evidence.quietPeriodAnswer === "NO") {
    failures.push("Confirmation did not document a quiet period without workplace loud-noise exposure");
  } else if (evidence.quietPeriodAnswer === "UNKNOWN") {
    incomplete.push("Workplace loud-noise exposure during the quiet period is unknown");
  }

  if (evidence.quietPeriodHours === null) {
    incomplete.push("Confirmation quiet-period hours are not documented");
  } else if (evidence.quietPeriodHours < NIOSH_CONFIRMATION_QUIET_HOURS) {
    failures.push("Confirmation requires a documented quiet period of at least 12 hours");
  }

  if (evidence.highNonoccupationalNoise === "YES") {
    failures.push("Loud non-occupational noise was reported during the quiet period");
  } else if (evidence.highNonoccupationalNoise === "UNKNOWN") {
    incomplete.push("Non-occupational loud-noise exposure during the quiet period is unknown");
  }

  if (evidence.hearingProtectionUsedAsSubstitute === "YES") {
    failures.push("Hearing protection cannot substitute for the required NIOSH quiet period");
  } else if (evidence.hearingProtectionUsedAsSubstitute === "UNKNOWN") {
    incomplete.push("Use of hearing protection as a substitute for quiet is unknown");
  }

  if (failures.length > 0) {
    return { status: "NOT_ELIGIBLE", reasons: [...failures, ...incomplete] };
  }
  if (incomplete.length > 0) {
    return { status: "INSUFFICIENT_DATA", reasons: incomplete };
  }
  return { status: "ELIGIBLE", reasons: [] };
}

export type NioshPersistenceStatus =
  | "NO_SHIFT_DETECTED"
  | "INSUFFICIENT_DATA"
  | "NIOSH_SHIFT_NOT_CONFIRMED"
  | "NIOSH_PERSISTENT_SHIFT_CONFIRMED";

export type NioshPersistenceFinding = {
  ear: Ear;
  frequencyHz: FrequencyHz;
  baselineDbHl: number;
  monitoringDbHl: number;
  immediateRetestDbHl: number | null;
  confirmationDbHl: number | null;
  monitoringDifferenceDb: number;
  immediateRetestDifferenceDb: number | null;
  confirmationDifferenceDb: number | null;
  immediateRetestPersistent: boolean | null;
  confirmationPersistent: boolean | null;
};

export type NioshPersistenceAnalysis = {
  framework: "NIOSH_PERSISTENCE_ANALYSIS";
  status: NioshPersistenceStatus;
  findings: NioshPersistenceFinding[];
  reasons: string[];
  interpretationFlags: Array<"POSSIBLE_MEASUREMENT_VARIABILITY">;
  automaticBaselineChange: false;
  thaiFollowUpMutation: false;
};

function baseResult(
  status: NioshPersistenceStatus,
  findings: NioshPersistenceFinding[],
  reasons: string[] = [],
  interpretationFlags: Array<"POSSIBLE_MEASUREMENT_VARIABILITY"> = [],
): NioshPersistenceAnalysis {
  return {
    framework: "NIOSH_PERSISTENCE_ANALYSIS",
    status,
    findings,
    reasons,
    interpretationFlags,
    automaticBaselineChange: false,
    thaiFollowUpMutation: false,
  };
}

/**
 * Optional longitudinal decision support. This does not execute the Thai rule,
 * revise a baseline, or create/close a surveillance case.
 */
export function analyzeNioshPersistence(
  baseline: Audiogram | null,
  monitoring: Audiogram,
  immediateRetest: Audiogram | null,
  confirmation: Audiogram | null = null,
  confirmationEvidence: NioshConfirmationEvidence | null = null,
): NioshPersistenceAnalysis {
  const monitoringComparison = compareAudiograms(
    baseline,
    monitoring,
    NIOSH_ANALYTICAL_FREQUENCIES,
  );

  if (monitoringComparison.status === "not_evaluable") {
    return baseResult("INSUFFICIENT_DATA", [], monitoringComparison.reasons);
  }

  const shifted = monitoringComparison.comparisons.filter(
    (item) => item.differenceDb >= NIOSH_SHIFT_DB,
  );

  if (shifted.length === 0) {
    return baseResult("NO_SHIFT_DETECTED", []);
  }

  let findings = shifted.map((item): NioshPersistenceFinding => ({
    ear: item.ear,
    frequencyHz: item.frequencyHz,
    baselineDbHl: item.baselineDbHl,
    monitoringDbHl: item.currentDbHl,
    immediateRetestDbHl: null,
    confirmationDbHl: null,
    monitoringDifferenceDb: item.differenceDb,
    immediateRetestDifferenceDb: null,
    confirmationDifferenceDb: null,
    immediateRetestPersistent: null,
    confirmationPersistent: null,
  }));

  if (immediateRetest && immediateRetest.examDate < monitoring.examDate) {
    return baseResult("INSUFFICIENT_DATA", [], [
      "Immediate retest must not precede the monitoring audiogram",
    ]);
  }

  if (immediateRetest) {
    if (immediateRetest.examDate !== monitoring.examDate) {
      return baseResult("INSUFFICIENT_DATA", findings, [
        "Immediate retest must be performed during the same testing date as the monitoring audiogram",
      ]);
    }
    const retestComparison = compareAudiograms(
      baseline,
      immediateRetest,
      NIOSH_ANALYTICAL_FREQUENCIES,
    );
    if (retestComparison.status === "not_evaluable") {
      return baseResult("INSUFFICIENT_DATA", [], retestComparison.reasons);
    }
    const retestByPoint = new Map(
      retestComparison.comparisons.map((item) => [
        `${item.ear}:${item.frequencyHz}`,
        item,
      ]),
    );
    findings = findings.map((finding) => {
      const point = retestByPoint.get(`${finding.ear}:${finding.frequencyHz}`);
      const differenceDb = point?.differenceDb ?? null;
      return {
        ...finding,
        immediateRetestDbHl: point?.currentDbHl ?? null,
        immediateRetestDifferenceDb: differenceDb,
        immediateRetestPersistent:
          differenceDb === null ? null : differenceDb >= NIOSH_SHIFT_DB,
      };
    });
    if (!findings.some((finding) => finding.immediateRetestPersistent)) {
      return baseResult(
        "NIOSH_SHIFT_NOT_CONFIRMED",
        findings,
        [],
        ["POSSIBLE_MEASUREMENT_VARIABILITY"],
      );
    }
  }

  if (confirmation === null) {
    return baseResult("INSUFFICIENT_DATA", findings, [
      immediateRetest
        ? "The immediate retest reproduced a shift but no quiet-period confirmation audiogram is available"
        : "A qualifying monitoring shift exists but no confirmation audiogram is available; immediate retest is optional",
    ]);
  }

  if (confirmation.examDate < monitoring.examDate) {
    return baseResult("INSUFFICIENT_DATA", findings, [
      "Confirmation audiogram must not precede the monitoring audiogram",
    ]);
  }
  const confirmationDeadline = new Date(`${monitoring.examDate}T00:00:00.000Z`);
  confirmationDeadline.setUTCDate(
    confirmationDeadline.getUTCDate() + NIOSH_CONFIRMATION_DAYS,
  );
  const confirmationDate = new Date(`${confirmation.examDate}T00:00:00.000Z`);
  if (confirmationDate > confirmationDeadline) {
    return baseResult("INSUFFICIENT_DATA", findings, [
      "Confirmation audiogram must be completed within 30 days of the monitoring audiogram",
    ]);
  }
  const evidenceAssessment = assessNioshConfirmationEvidence(confirmationEvidence);
  if (evidenceAssessment.status !== "ELIGIBLE") {
    return baseResult("INSUFFICIENT_DATA", findings, evidenceAssessment.reasons);
  }

  const confirmationComparison = compareAudiograms(
    baseline,
    confirmation,
    NIOSH_ANALYTICAL_FREQUENCIES,
  );
  if (confirmationComparison.status === "not_evaluable") {
    return baseResult("INSUFFICIENT_DATA", findings, confirmationComparison.reasons);
  }
  const confirmationByPoint = new Map(
    confirmationComparison.comparisons.map((item) => [
      `${item.ear}:${item.frequencyHz}`,
      item,
    ]),
  );
  findings = findings.map((finding) => {
    const point = confirmationByPoint.get(`${finding.ear}:${finding.frequencyHz}`);
    const differenceDb = point?.differenceDb ?? null;
    return {
      ...finding,
      confirmationDbHl: point?.currentDbHl ?? null,
      confirmationDifferenceDb: differenceDb,
      confirmationPersistent:
        differenceDb === null ? null : differenceDb >= NIOSH_SHIFT_DB,
    };
  });

  return findings.some((finding) => finding.confirmationPersistent)
    ? baseResult("NIOSH_PERSISTENT_SHIFT_CONFIRMED", findings)
    : baseResult(
        "NIOSH_SHIFT_NOT_CONFIRMED",
        findings,
        [],
        ["POSSIBLE_MEASUREMENT_VARIABILITY"],
      );
}
