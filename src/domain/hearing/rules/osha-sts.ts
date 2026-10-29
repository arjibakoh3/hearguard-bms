import { compareAudiograms } from "../calculations/compare-audiograms";
import type { Audiogram, Ear, FrequencyHz } from "../types/audiogram";
import type { HearingEvaluationStatus } from "../types/evaluation";

const OSHA_FREQUENCIES_HZ = [2000, 3000, 4000] as const satisfies readonly FrequencyHz[];
const OSHA_SHIFT_DB = 10;
export const OSHA_STS_RULE_NAME = "OSHA Standard Threshold Shift Comparator";

export type OshaStsFinding = {
  ear: Ear;
  frequenciesHz: typeof OSHA_FREQUENCIES_HZ;
  baselineAverageDbHl: number;
  currentAverageDbHl: number;
  differenceDb: number;
  criterion: string;
};

export type OshaStsEvaluation = {
  ruleCode: "OSHA_STS_29_CFR_1910_95";
  ruleName: typeof OSHA_STS_RULE_NAME;
  ruleVersion: "0.1.0";
  status: HearingEvaluationStatus;
  earAverages: OshaStsFinding[];
  triggeredFindings: OshaStsFinding[];
  notEvaluableReasons: string[];
  evaluatedAt: string;
};

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function evaluateOshaSts(
  baseline: Audiogram | null,
  current: Audiogram,
  evaluatedAt: string,
): OshaStsEvaluation {
  const comparison = compareAudiograms(
    baseline,
    current,
    OSHA_FREQUENCIES_HZ,
  );

  if (comparison.status === "not_evaluable") {
    return {
      ruleCode: "OSHA_STS_29_CFR_1910_95",
      ruleName: OSHA_STS_RULE_NAME,
      ruleVersion: "0.1.0",
      status: "not_evaluable",
      earAverages: [],
      triggeredFindings: [],
      notEvaluableReasons: comparison.reasons,
      evaluatedAt,
    };
  }

  const earAverages = (["LEFT", "RIGHT"] as const).map((ear) => {
    const earComparisons = comparison.comparisons.filter(
      (item) => item.ear === ear,
    );
    const baselineAverageDbHl = average(
      earComparisons.map((item) => item.baselineDbHl),
    );
    const currentAverageDbHl = average(
      earComparisons.map((item) => item.currentDbHl),
    );
    const differenceDb = currentAverageDbHl - baselineAverageDbHl;

    return {
      ear,
      frequenciesHz: OSHA_FREQUENCIES_HZ,
      baselineAverageDbHl,
      currentAverageDbHl,
      differenceDb,
      criterion:
        "Average threshold change at 2000, 3000, and 4000 Hz is greater than or equal to 10 dB in either ear.",
    };
  });
  const triggeredFindings = earAverages.filter(
    (finding) => finding.differenceDb >= OSHA_SHIFT_DB,
  );

  return {
    ruleCode: "OSHA_STS_29_CFR_1910_95",
    ruleName: OSHA_STS_RULE_NAME,
    ruleVersion: "0.1.0",
    status: triggeredFindings.length > 0 ? "positive" : "negative",
    earAverages,
    triggeredFindings,
    notEvaluableReasons: [],
    evaluatedAt,
  };
}
