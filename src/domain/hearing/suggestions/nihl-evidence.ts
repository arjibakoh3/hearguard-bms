import type {
  AudiogramThresholdObservation,
  Ear,
  FrequencyHz,
} from "../types/audiogram";

export const NIHL_EVIDENCE_RULE = {
  code: "NIHL_EVIDENCE_PROFILE",
  version: "1.1.0",
  name: "NIHL evidence profile (suggestion only)",
} as const;

export type NoiseMetric = "LEX_8H" | "LAEQ_TE" | "DAILY_DOSE";
export type EvidenceQuality = "HIGH" | "MODERATE" | "LOW" | "UNKNOWN";

export type NoiseExposureSource = {
  id: string;
  metric: NoiseMetric;
  levelDbA: number | null;
  dosePercent: number | null;
  measurementDurationHours: number | null;
  exchangeRateDb: number | null;
  criterionLevelDbA: number | null;
  quality: EvidenceQuality;
  sourceType:
    | "PERSONAL_DOSIMETRY"
    | "AREA_MEASUREMENT"
    | "REPRESENTATIVE_JOB_GROUP"
    | "RECORD_REVIEW"
    | "PATIENT_RECALL";
};

export type HearingProtectionEvidence = {
  attenuationMethod: "PAR" | "NRR" | "NONE" | "UNKNOWN";
  attenuationDb: number | null;
  wearingTimePercent: number | null;
};

export type NoiseExposurePeriodEvidence = {
  id: string;
  startDate: string;
  endDate: string | null;
  hoursPerDay: number | null;
  daysPerWeek: number | null;
  weeksPerYear: number | null;
  pattern: "CONTINUOUS" | "INTERMITTENT" | "FLUCTUATING" | "IMPULSE" | "MIXED" | "UNKNOWN";
  impulseNoise: boolean;
  sources: NoiseExposureSource[];
  hearingProtection: HearingProtectionEvidence[];
};

export type NihlAudiogramSnapshot = {
  id: string;
  employeeId?: string;
  examinedAt: string;
  isValid: boolean;
  observations: AudiogramThresholdObservation[];
};

export type NihlAlternativeContributor = {
  code: string;
  label: string;
  earScope: "LEFT" | "RIGHT" | "BOTH" | "UNKNOWN" | null;
  source: string;
};

export type NihlEvidenceInput = {
  currentAudiogram: NihlAudiogramSnapshot;
  longitudinalAudiograms: NihlAudiogramSnapshot[];
  exposurePeriods: NoiseExposurePeriodEvidence[];
  alternativeContributors: NihlAlternativeContributor[];
  accessLimited?: boolean;
  identityScope: "HN_LINKED" | "EMPLOYEE_ONLY";
};

export type DoseEvidence = {
  periodId: string;
  sourceId: string;
  rawDailyDosePercent: number | null;
  protectedDailyDosePercent: number | null;
  usableForNioshDose: boolean;
  reason: string;
};

export type NotchDetectorResult = {
  detector: "COLeskyBroadNotch" | "FOUR_KHZ_SPECIFIC";
  ear: Ear;
  evaluable: boolean;
  demonstrated: boolean;
  targetFrequencyHz: FrequencyHz | null;
  targetDbHl: number | null;
  lowerAnchorDbHl: number | null;
  upperAnchorDbHl: number | null;
  reason: string;
};

export type NihlEvidenceState =
  | "EXPOSURE_AND_PATTERN_COMPATIBLE"
  | "COMPATIBLE_WITH_MIXED_FACTORS"
  | "ATYPICAL_FEATURES_PRESENT"
  | "CURRENT_EVIDENCE_NOT_SUPPORTIVE"
  | "INSUFFICIENT_DATA";

export type NihlEvidenceResult = {
  ruleCode: typeof NIHL_EVIDENCE_RULE.code;
  ruleVersion: "1.0.0" | typeof NIHL_EVIDENCE_RULE.version;
  identityScope?: "HN_LINKED" | "EMPLOYEE_ONLY";
  state: NihlEvidenceState;
  completeness: "COMPLETE" | "PARTIAL" | "ACCESS_LIMITED";
  nonDiagnostic: true;
  exposure: {
    status: "SUPPORTIVE" | "POSSIBLY_SUPPORTIVE" | "NOT_SUPPORTIVE" | "INSUFFICIENT";
    maxRawDailyDosePercent: number | null;
    totalExposureYears: number;
    doseEvidence: DoseEvidence[];
    periodDailyDoses: Array<{
      periodId: string;
      rawDailyDosePercent: number | null;
      protectedDailyDosePercent: number | null;
    }>;
    impulseNoisePresent: boolean;
    explanation: string;
  };
  notch: {
    status: "CONCORDANT" | "POSSIBLE" | "NOT_DEMONSTRATED" | "NOT_EVALUABLE";
    detectors: NotchDetectorResult[];
    historicalBroadening: boolean;
    explanation: string;
  };
  longitudinal: {
    audiogramCount: number;
    observationYears: number;
    explanation: string;
  };
  symmetry: {
    status: "SYMMETRIC" | "ASYMMETRY_REVIEW" | "NOT_EVALUABLE";
    lowMidAverageDifferenceDb: number | null;
    maximumDifferenceDb: number | null;
    explanation: string;
  };
  protection: {
    status: "PAR_SUPPORTED" | "REPORTED_ONLY" | "NONE_RECORDED";
    explanation: string;
  };
  alternatives: NihlAlternativeContributor[];
  explanation: string;
  limitations: string[];
};

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export function calculateNioshDailyDose(input: {
  metric: NoiseMetric;
  levelDbA?: number | null;
  dosePercent?: number | null;
  durationHours?: number | null;
  exchangeRateDb?: number | null;
  criterionLevelDbA?: number | null;
}): { dosePercent: number | null; usable: boolean; reason: string } {
  if (input.metric === "DAILY_DOSE") {
    if (input.dosePercent === null || input.dosePercent === undefined) {
      return { dosePercent: null, usable: false, reason: "Daily dose value is missing." };
    }
    if (input.exchangeRateDb !== 3 || input.criterionLevelDbA !== 85) {
      return {
        dosePercent: null,
        usable: false,
        reason: "Dose was not documented with the NIOSH 85 dBA criterion and 3 dB exchange rate.",
      };
    }
    return { dosePercent: round(input.dosePercent), usable: true, reason: "Documented NIOSH-compatible daily dose." };
  }

  if (input.levelDbA === null || input.levelDbA === undefined) {
    return { dosePercent: null, usable: false, reason: "Noise level is missing." };
  }
  const duration = input.metric === "LEX_8H" ? 8 : input.durationHours;
  if (duration === null || duration === undefined || duration <= 0) {
    return { dosePercent: null, usable: false, reason: "Measurement duration is missing." };
  }
  const dose = 100 * (duration / 8) * (2 ** ((input.levelDbA - 85) / 3));
  return {
    dosePercent: round(dose),
    usable: true,
    reason: input.metric === "LEX_8H"
      ? "Calculated from LEX,8h using the NIOSH 85 dBA criterion and 3 dB exchange rate."
      : "Calculated from LAeq,T and duration using the NIOSH 85 dBA criterion and 3 dB exchange rate.",
  };
}

function protectedDose(rawDose: number, source: NoiseExposureSource, protection: HearingProtectionEvidence[]): number | null {
  const par = protection.find((item) =>
    item.attenuationMethod === "PAR"
    && item.attenuationDb !== null
    && item.wearingTimePercent !== null,
  );
  if (!par || source.levelDbA === null) return null;
  const coverage = Math.max(0, Math.min(100, par.wearingTimePercent as number)) / 100;
  const protectedLevel = source.levelDbA - (par.attenuationDb as number);
  const duration = source.metric === "LEX_8H" ? 8 : source.measurementDurationHours;
  if (!duration) return null;
  const protectedEstimate = calculateNioshDailyDose({
    metric: source.metric === "DAILY_DOSE" ? "LAEQ_TE" : source.metric,
    levelDbA: protectedLevel,
    durationHours: duration,
  });
  if (!protectedEstimate.usable || protectedEstimate.dosePercent === null) return null;
  return round((coverage * protectedEstimate.dosePercent) + ((1 - coverage) * rawDose));
}

function unionExposureYears(periods: NoiseExposurePeriodEvidence[]): number {
  const ranges = periods.flatMap((period) => {
    const start = new Date(`${period.startDate}T00:00:00Z`).getTime();
    const end = period.endDate ? new Date(`${period.endDate}T00:00:00Z`).getTime() : Date.now();
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
  }).sort((left, right) => left.start - right.start);
  if (ranges.length === 0) return 0;
  let totalMs = 0;
  let current = { ...ranges[0] };
  for (const range of ranges.slice(1)) {
    if (range.start <= current.end) current.end = Math.max(current.end, range.end);
    else {
      totalMs += current.end - current.start;
      current = { ...range };
    }
  }
  totalMs += current.end - current.start;
  return round(totalMs / (365.25 * 24 * 60 * 60 * 1000));
}

function thresholdMap(audiogram: NihlAudiogramSnapshot, ear: Ear): Map<number, number> {
  return new Map(audiogram.observations.flatMap((point) =>
    point.ear === ear && point.responseStatus === "MEASURED"
      ? [[point.frequencyHz, point.thresholdDbHl] as const]
      : [],
  ));
}

function broadNotch(audiogram: NihlAudiogramSnapshot, ear: Ear): NotchDetectorResult {
  const values = thresholdMap(audiogram, ear);
  const lowerValues = [1000, 2000].flatMap((frequency) => values.has(frequency) ? [values.get(frequency)!] : []);
  const upperValues = [6000, 8000].flatMap((frequency) => values.has(frequency) ? [values.get(frequency)!] : []);
  if (lowerValues.length === 0 || upperValues.length === 0) {
    return { detector: "COLeskyBroadNotch", ear, evaluable: false, demonstrated: false, targetFrequencyHz: null, targetDbHl: null, lowerAnchorDbHl: null, upperAnchorDbHl: null, reason: "Requires a measured 1/2 kHz lower anchor and 6/8 kHz upper anchor." };
  }
  const lower = Math.min(...lowerValues);
  const candidates = ([3000, 4000, 6000] as FrequencyHz[]).flatMap((frequency) => {
    const target = values.get(frequency);
    const upperEligible = frequency === 6000
      ? (values.has(8000) ? values.get(8000)! : null)
      : Math.min(...upperValues);
    return target === undefined || upperEligible === null
      ? []
      : [{ frequency, target, upper: upperEligible, depth: Math.min(target - lower, target - upperEligible) }];
  });
  if (candidates.length === 0) {
    return { detector: "COLeskyBroadNotch", ear, evaluable: false, demonstrated: false, targetFrequencyHz: null, targetDbHl: null, lowerAnchorDbHl: lower, upperAnchorDbHl: null, reason: "No measured 3/4/6 kHz target has the required upper anchor." };
  }
  const strongest = [...candidates].sort((left, right) => right.depth - left.depth)[0];
  const demonstrated = strongest.depth >= 10;
  return {
    detector: "COLeskyBroadNotch",
    ear,
    evaluable: true,
    demonstrated,
    targetFrequencyHz: strongest.frequency,
    targetDbHl: strongest.target,
    lowerAnchorDbHl: lower,
    upperAnchorDbHl: strongest.upper,
    reason: demonstrated
      ? `${strongest.frequency / 1000} kHz is at least 10 dB worse than both lower- and upper-frequency anchors.`
      : "No 3/4/6 kHz point is at least 10 dB worse than both anchors.",
  };
}

function fourKhzNotch(audiogram: NihlAudiogramSnapshot, ear: Ear): NotchDetectorResult {
  const values = thresholdMap(audiogram, ear);
  const two = values.get(2000);
  const four = values.get(4000);
  const eight = values.get(8000);
  if (two === undefined || four === undefined || eight === undefined) {
    return { detector: "FOUR_KHZ_SPECIFIC", ear, evaluable: false, demonstrated: false, targetFrequencyHz: null, targetDbHl: null, lowerAnchorDbHl: two ?? null, upperAnchorDbHl: eight ?? null, reason: "Requires measured thresholds at 2, 4, and 8 kHz." };
  }
  const demonstrated = four - two >= 10 && four - eight >= 10;
  return {
    detector: "FOUR_KHZ_SPECIFIC",
    ear,
    evaluable: true,
    demonstrated,
    targetFrequencyHz: 4000,
    targetDbHl: four,
    lowerAnchorDbHl: two,
    upperAnchorDbHl: eight,
    reason: demonstrated
      ? "4 kHz is at least 10 dB worse than both 2 and 8 kHz."
      : "The measured 4 kHz point does not meet both 10 dB anchor contrasts.",
  };
}

export function evaluateAudiometricNotch(audiogram: NihlAudiogramSnapshot) {
  const detectors = (["LEFT", "RIGHT"] as Ear[]).flatMap((ear) => [
    broadNotch(audiogram, ear),
    fourKhzNotch(audiogram, ear),
  ]);
  const demonstrated = detectors.filter((item) => item.demonstrated);
  const concordant = (["LEFT", "RIGHT"] as Ear[]).some((ear) =>
    demonstrated.some((item) => item.ear === ear && item.detector === "COLeskyBroadNotch")
    && demonstrated.some((item) => item.ear === ear && item.detector === "FOUR_KHZ_SPECIFIC"),
  );
  const status = concordant
    ? "CONCORDANT" as const
    : demonstrated.length > 0
      ? "POSSIBLE" as const
      : detectors.some((item) => item.evaluable)
        ? "NOT_DEMONSTRATED" as const
        : "NOT_EVALUABLE" as const;
  return { status, detectors };
}

function highFrequencyAverage(audiogram: NihlAudiogramSnapshot): number | null {
  const values = (["LEFT", "RIGHT"] as Ear[]).flatMap((ear) => {
    const map = thresholdMap(audiogram, ear);
    return [3000, 4000, 6000].flatMap((frequency) => map.has(frequency) ? [map.get(frequency)!] : []);
  });
  return values.length >= 4 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function evaluateSymmetry(audiogram: NihlAudiogramSnapshot): NihlEvidenceResult["symmetry"] {
  const left = thresholdMap(audiogram, "LEFT");
  const right = thresholdMap(audiogram, "RIGHT");
  const lowMid = [500, 1000, 2000, 3000].flatMap((frequency) =>
    left.has(frequency) && right.has(frequency) ? [Math.abs(left.get(frequency)! - right.get(frequency)!)] : [],
  );
  const all = [500, 1000, 2000, 3000, 4000, 6000, 8000].flatMap((frequency) =>
    left.has(frequency) && right.has(frequency) ? [Math.abs(left.get(frequency)! - right.get(frequency)!)] : [],
  );
  if (lowMid.length < 3 || all.length < 5) {
    return { status: "NOT_EVALUABLE", lowMidAverageDifferenceDb: null, maximumDifferenceDb: all.length ? Math.max(...all) : null, explanation: "Measured bilateral air-conduction points are insufficient for the asymmetry screen." };
  }
  const average = round(lowMid.reduce((sum, value) => sum + value, 0) / lowMid.length);
  const maximum = Math.max(...all);
  const review = average >= 15 || maximum >= 25;
  return {
    status: review ? "ASYMMETRY_REVIEW" : "SYMMETRIC",
    lowMidAverageDifferenceDb: average,
    maximumDifferenceDb: maximum,
    explanation: review
      ? "Air-conduction asymmetry marker is present; review non-occupational and otologic explanations. This is not a diagnosis of sensorineural loss."
      : "No material interaural asymmetry was demonstrated by this air-conduction screening marker.",
  };
}

export function evaluateNihlEvidence(input: NihlEvidenceInput): NihlEvidenceResult {
  const doseEvidence: DoseEvidence[] = input.exposurePeriods.flatMap((period) =>
    period.sources.map((source) => {
      const calculated = calculateNioshDailyDose({
        metric: source.metric,
        levelDbA: source.levelDbA,
        dosePercent: source.dosePercent,
        durationHours: source.measurementDurationHours ?? period.hoursPerDay,
        exchangeRateDb: source.exchangeRateDb,
        criterionLevelDbA: source.criterionLevelDbA,
      });
      return {
        periodId: period.id,
        sourceId: source.id,
        rawDailyDosePercent: calculated.dosePercent,
        protectedDailyDosePercent: calculated.dosePercent === null
          ? null
          : protectedDose(calculated.dosePercent, source, period.hearingProtection),
        usableForNioshDose: calculated.usable,
        reason: calculated.reason,
      };
    }),
  );
  const periodDailyDoses = input.exposurePeriods.map((period) => {
    const entries = doseEvidence.filter((item) => item.periodId === period.id && item.usableForNioshDose);
    const sources = period.sources;
    const fullDay = entries.filter((entry) => {
      const metric = sources.find((source) => source.id === entry.sourceId)?.metric;
      return metric === "LEX_8H" || metric === "DAILY_DOSE";
    });
    const segments = entries.filter((entry) =>
      sources.find((source) => source.id === entry.sourceId)?.metric === "LAEQ_TE",
    );
    const fullDayRaw = fullDay.flatMap((item) => item.rawDailyDosePercent === null ? [] : [item.rawDailyDosePercent]);
    const segmentRaw = segments.flatMap((item) => item.rawDailyDosePercent === null ? [] : [item.rawDailyDosePercent]);
    const fullDayProtected = fullDay.flatMap((item) => item.protectedDailyDosePercent === null ? [] : [item.protectedDailyDosePercent]);
    const segmentProtected = segments.flatMap((item) => item.protectedDailyDosePercent === null ? [] : [item.protectedDailyDosePercent]);
    const rawCandidates = [
      ...(fullDayRaw.length ? [Math.max(...fullDayRaw)] : []),
      ...(segmentRaw.length ? [segmentRaw.reduce((sum, value) => sum + value, 0)] : []),
    ];
    const protectedCandidates = [
      ...(fullDayProtected.length ? [Math.max(...fullDayProtected)] : []),
      ...(segmentProtected.length ? [segmentProtected.reduce((sum, value) => sum + value, 0)] : []),
    ];
    return {
      periodId: period.id,
      rawDailyDosePercent: rawCandidates.length ? round(Math.max(...rawCandidates)) : null,
      protectedDailyDosePercent: protectedCandidates.length ? round(Math.max(...protectedCandidates)) : null,
    };
  });
  const usableDoses = periodDailyDoses.flatMap((item) => item.rawDailyDosePercent === null ? [] : [item.rawDailyDosePercent]);
  const maxDose = usableDoses.length ? Math.max(...usableDoses) : null;
  const totalYears = unionExposureYears(input.exposurePeriods);
  const exposureStatus = maxDose === null
    ? "INSUFFICIENT" as const
    : maxDose >= 100 && totalYears >= 1
      ? "SUPPORTIVE" as const
      : (maxDose >= 50 && totalYears >= 5)
        ? "POSSIBLY_SUPPORTIVE" as const
        : "NOT_SUPPORTIVE" as const;

  const currentNotch = evaluateAudiometricNotch(input.currentAudiogram);
  const priorValid = input.longitudinalAudiograms
    .filter((item) => item.id !== input.currentAudiogram.id && item.isValid)
    .sort((left, right) => left.examinedAt.localeCompare(right.examinedAt));
  const priorNotch = priorValid.some((item) => {
    const status = evaluateAudiometricNotch(item).status;
    return status === "CONCORDANT" || status === "POSSIBLE";
  });
  const currentHighAverage = highFrequencyAverage(input.currentAudiogram);
  const historicalBroadening = priorNotch
    && currentNotch.status === "NOT_DEMONSTRATED"
    && currentHighAverage !== null
    && currentHighAverage >= 40;
  const notchExplanation = historicalBroadening
    ? "A named notch detector was positive in an earlier valid audiogram, while the latest high-frequency loss is broader. This supports review for historical notch broadening; it does not prove causation."
    : currentNotch.status === "CONCORDANT"
      ? "Both named notch detectors are concordant in at least one ear."
      : currentNotch.status === "POSSIBLE"
        ? "One named notch detector is positive; the audiogram shape should be interpreted with the full clinical and exposure history."
        : currentNotch.status === "NOT_DEMONSTRATED"
          ? "The selected named notch definitions are not demonstrated. Absence of a notch does not exclude NIHL."
          : "Required measured frequencies are missing or contain NR/Not tested, so notch shape is not evaluable.";

  const chronological = [...input.longitudinalAudiograms]
    .filter((item) => item.isValid)
    .sort((left, right) => left.examinedAt.localeCompare(right.examinedAt));
  const observationYears = chronological.length < 2 ? 0 : round(
    (new Date(chronological.at(-1)!.examinedAt).getTime() - new Date(chronological[0].examinedAt).getTime())
      / (365.25 * 24 * 60 * 60 * 1000),
  );
  const symmetry = evaluateSymmetry(input.currentAudiogram);
  const hasPar = input.exposurePeriods.some((period) => period.hearingProtection.some((item) =>
    item.attenuationMethod === "PAR" && item.attenuationDb !== null && item.wearingTimePercent !== null,
  ));
  const hasReportedProtection = input.exposurePeriods.some((period) => period.hearingProtection.length > 0);
  const protection = hasPar
    ? { status: "PAR_SUPPORTED" as const, explanation: "A protected-at-ear estimate is shown only where individual PAR and wearing-time coverage are documented. Raw exposure remains visible." }
    : hasReportedProtection
      ? { status: "REPORTED_ONLY" as const, explanation: "Hearing protection is reported, but NRR/checkbox evidence is not used to reduce the primary exposure estimate." }
      : { status: "NONE_RECORDED" as const, explanation: "No hearing-protection evidence is recorded for the exposure periods." };

  const notchSupport = currentNotch.status === "CONCORDANT" || currentNotch.status === "POSSIBLE" || historicalBroadening;
  const enoughCoreData = input.currentAudiogram.isValid
    && currentNotch.status !== "NOT_EVALUABLE"
    && exposureStatus !== "INSUFFICIENT";
  let state: NihlEvidenceState;
  if (!enoughCoreData) state = "INSUFFICIENT_DATA";
  else if (symmetry.status === "ASYMMETRY_REVIEW") state = "ATYPICAL_FEATURES_PRESENT";
  else if (input.alternativeContributors.length > 0 && (exposureStatus === "SUPPORTIVE" || notchSupport)) state = "COMPATIBLE_WITH_MIXED_FACTORS";
  else if ((exposureStatus === "SUPPORTIVE" || exposureStatus === "POSSIBLY_SUPPORTIVE") && notchSupport) state = "EXPOSURE_AND_PATTERN_COMPATIBLE";
  else state = "CURRENT_EVIDENCE_NOT_SUPPORTIVE";

  const limitations = [
    "This is an evidence-organizing suggestion, not a diagnosis or causal apportionment.",
    "The notch analysis is independent of 15 dB threshold-shift surveillance and never derives a notch from a shift result.",
    "No ISO 1999 individual NIPTS estimate, age correction, or presbycusis subtraction is performed.",
    "Air-conduction audiometry alone cannot establish sensorineural mechanism or exclude other otologic disease.",
  ];
  if (input.identityScope === "EMPLOYEE_ONLY") limitations.push("No verified hospital HN is linked. This assessment uses only the current employee record and may omit hearing or exposure history from other employments.");
  if (input.accessLimited) limitations.push("The longitudinal HN view is limited to organizations accessible to the current hospital user.");
  if (doseEvidence.some((item) => !item.usableForNioshDose)) limitations.push("At least one exposure source is incompatible with the NIOSH 85 dBA/3 dB dose calculation or lacks required data.");

  return {
    ruleCode: NIHL_EVIDENCE_RULE.code,
    ruleVersion: NIHL_EVIDENCE_RULE.version,
    identityScope: input.identityScope,
    state,
    completeness: input.identityScope === "EMPLOYEE_ONLY" ? "PARTIAL" : input.accessLimited ? "ACCESS_LIMITED" : enoughCoreData ? "COMPLETE" : "PARTIAL",
    nonDiagnostic: true,
    exposure: {
      status: exposureStatus,
      maxRawDailyDosePercent: maxDose,
      totalExposureYears: totalYears,
      doseEvidence,
      periodDailyDoses,
      impulseNoisePresent: input.exposurePeriods.some((period) => period.impulseNoise),
      explanation: exposureStatus === "SUPPORTIVE"
        ? "Documented exposure includes a NIOSH-equivalent daily dose at or above 100%."
        : exposureStatus === "POSSIBLY_SUPPORTIVE"
          ? "Documented exposure is below 100% daily dose but is sustained enough to remain clinically relevant."
          : exposureStatus === "NOT_SUPPORTIVE"
            ? "Available quantified exposure is below the configured evidence marker; this does not prove absence of past exposure."
            : "Quantified exposure compatible with NIOSH dose calculation is unavailable.",
    },
    notch: { status: currentNotch.status, detectors: currentNotch.detectors, historicalBroadening, explanation: notchExplanation },
    longitudinal: {
      audiogramCount: chronological.length,
      observationYears,
      explanation: chronological.length >= 2
        ? `${chronological.length} valid audiograms span approximately ${observationYears} years; timing is supporting context and is not a regulatory shift calculation.`
        : "Fewer than two valid audiograms are available for longitudinal context.",
    },
    symmetry,
    protection,
    alternatives: input.alternativeContributors,
    explanation: {
      EXPOSURE_AND_PATTERN_COMPATIBLE: "The available exposure and audiometric-shape evidence are compatible with occupational NIHL. Physician interpretation remains required.",
      COMPATIBLE_WITH_MIXED_FACTORS: "Occupational noise remains compatible, but recorded alternative contributors make a mixed or multifactorial explanation plausible.",
      ATYPICAL_FEATURES_PRESENT: "An atypical feature is present and should be reviewed before attributing the pattern to occupational noise.",
      CURRENT_EVIDENCE_NOT_SUPPORTIVE: "The currently available quantified exposure and selected audiogram-pattern markers do not jointly support NIHL. This is not an exclusion diagnosis.",
      INSUFFICIENT_DATA: "Core exposure or audiometric-shape evidence is incomplete; more data are needed before a useful compatibility suggestion can be made.",
    }[state],
    limitations,
  };
}
