import {
  AudiogramSchema,
  EARS,
  SUPPORTED_FREQUENCIES_HZ,
  type Audiogram,
  type AudiogramThreshold,
  type Ear,
  type FrequencyHz,
} from "../types/audiogram";

export type ThresholdComparison = {
  ear: Ear;
  frequencyHz: FrequencyHz;
  baselineDbHl: number;
  currentDbHl: number;
  differenceDb: number;
};

export type AudiogramComparison =
  | {
      status: "evaluable";
      comparisons: ThresholdComparison[];
      reasons: [];
    }
  | {
      status: "not_evaluable";
      comparisons: [];
      reasons: string[];
    };

type ThresholdIndex = Map<string, AudiogramThreshold>;

export function calculateThresholdDifference(
  baselineDbHl: number,
  currentDbHl: number,
): number {
  return currentDbHl - baselineDbHl;
}

function thresholdKey(ear: Ear, frequencyHz: FrequencyHz): string {
  return `${ear}:${frequencyHz}`;
}

function indexThresholds(
  thresholds: AudiogramThreshold[],
  label: "Baseline" | "Current",
): { index: ThresholdIndex; reasons: string[] } {
  const index: ThresholdIndex = new Map();
  const reasons: string[] = [];

  for (const threshold of thresholds) {
    const key = thresholdKey(threshold.ear, threshold.frequencyHz);

    if (index.has(key)) {
      reasons.push(
        `${label} audiogram contains a duplicate threshold at ${threshold.ear} ${threshold.frequencyHz} Hz`,
      );
      continue;
    }

    index.set(key, threshold);
  }

  return { index, reasons };
}

function validationReasons(
  value: Audiogram,
  label: "Baseline" | "Current",
): string[] {
  const validation = AudiogramSchema.safeParse(value);

  if (validation.success) {
    return [];
  }

  return [`${label} audiogram data failed runtime validation`];
}

export function compareAudiograms(
  baseline: Audiogram | null,
  current: Audiogram,
  monitoredFrequenciesHz: readonly FrequencyHz[] = SUPPORTED_FREQUENCIES_HZ,
): AudiogramComparison {
  if (baseline === null) {
    return {
      status: "not_evaluable",
      comparisons: [],
      reasons: ["Baseline audiogram unavailable"],
    };
  }

  const reasons = [
    ...validationReasons(baseline, "Baseline"),
    ...validationReasons(current, "Current"),
  ];

  if (!baseline.isValid) {
    reasons.push("Baseline audiogram is marked invalid");
  }

  if (!current.isValid) {
    reasons.push("Current audiogram is marked invalid");
  }

  if (baseline.employeeId !== current.employeeId) {
    reasons.push("Baseline and current audiograms belong to different employees");
  }

  const baselineThresholds = indexThresholds(baseline.thresholds, "Baseline");
  const currentThresholds = indexThresholds(current.thresholds, "Current");
  reasons.push(...baselineThresholds.reasons, ...currentThresholds.reasons);

  const comparisons: ThresholdComparison[] = [];

  for (const ear of EARS) {
    for (const frequencyHz of monitoredFrequenciesHz) {
      const key = thresholdKey(ear, frequencyHz);
      const baselineThreshold = baselineThresholds.index.get(key);
      const currentThreshold = currentThresholds.index.get(key);

      if (!baselineThreshold) {
        reasons.push(`Baseline threshold missing: ${ear} ${frequencyHz} Hz`);
      }

      if (!currentThreshold) {
        reasons.push(`Current threshold missing: ${ear} ${frequencyHz} Hz`);
      }

      if (baselineThreshold && currentThreshold) {
        comparisons.push({
          ear,
          frequencyHz,
          baselineDbHl: baselineThreshold.thresholdDbHl,
          currentDbHl: currentThreshold.thresholdDbHl,
          differenceDb: calculateThresholdDifference(
            baselineThreshold.thresholdDbHl,
            currentThreshold.thresholdDbHl,
          ),
        });
      }
    }
  }

  if (reasons.length > 0) {
    return { status: "not_evaluable", comparisons: [], reasons };
  }

  return { status: "evaluable", comparisons, reasons: [] };
}
