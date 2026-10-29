import type { Ear, FrequencyHz } from "./audiogram";

export type HearingEvaluationStatus =
  | "negative"
  | "positive"
  | "not_evaluable";

export type HearingFinding = {
  ear: Ear;
  frequencyHz: FrequencyHz;
  baselineDbHl: number;
  currentDbHl: number;
  differenceDb: number;
  criterion: string;
};

export type HearingRuleEvaluation = {
  ruleCode: string;
  ruleName: string;
  ruleVersion: string;
  status: HearingEvaluationStatus;
  triggeredFindings: HearingFinding[];
  notEvaluableReasons: string[];
  explanation: string;
  recommendedAction: string;
  evaluatedAt: string;
};

export type RuleMetadata = {
  code: string;
  name: string;
  version: string;
  jurisdiction: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  monitoredFrequenciesHz: readonly FrequencyHz[];
  thresholdShiftDb: number;
  repeatDueDays: number | null;
  referenceTitle: string;
};
