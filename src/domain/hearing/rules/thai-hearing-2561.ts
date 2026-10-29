import { compareAudiograms } from "../calculations/compare-audiograms";
import type { Audiogram } from "../types/audiogram";
import type {
  HearingFinding,
  HearingRuleEvaluation,
  RuleMetadata,
} from "../types/evaluation";

export const THAI_HEARING_RULE_2561: RuleMetadata = {
  code: "THAI_HEARING_2561",
  name: "Thai Hearing Surveillance Rule 2561",
  version: "2.0.0",
  jurisdiction: "Thailand",
  status: "ACTIVE",
  monitoredFrequenciesHz: [500, 1000, 2000, 3000, 4000, 6000],
  thresholdShiftDb: 15,
  repeatDueDays: 30,
  referenceTitle:
    "ประกาศกรมสวัสดิการและคุ้มครองแรงงาน เรื่อง หลักเกณฑ์และวิธีการจัดทำมาตรการอนุรักษ์การได้ยินในสถานประกอบกิจการ พ.ศ. 2561 ข้อ 5–6",
};

const CRITERION =
  "Current threshold minus baseline threshold is greater than or equal to 15 dB at a monitored frequency in either ear.";

function earLabel(ear: HearingFinding["ear"]): string {
  return ear === "LEFT" ? "Left" : "Right";
}

function findingExplanation(finding: HearingFinding): string {
  return `${earLabel(finding.ear)} ear at ${finding.frequencyHz} Hz deteriorated by ${finding.differenceDb} dB HL compared with baseline (baseline ${finding.baselineDbHl} dB HL; current ${finding.currentDbHl} dB HL).`;
}

export function evaluateThaiHearingRule(
  baseline: Audiogram | null,
  current: Audiogram,
  evaluatedAt: string,
): HearingRuleEvaluation {
  const comparison = compareAudiograms(
    baseline,
    current,
    THAI_HEARING_RULE_2561.monitoredFrequenciesHz,
  );

  if (comparison.status === "not_evaluable") {
    return {
      ruleCode: THAI_HEARING_RULE_2561.code,
      ruleName: THAI_HEARING_RULE_2561.name,
      ruleVersion: THAI_HEARING_RULE_2561.version,
      status: "not_evaluable",
      triggeredFindings: [],
      notEvaluableReasons: comparison.reasons,
      explanation: `Not evaluable: ${comparison.reasons.join("; ")}.`,
      recommendedAction:
        "Verify a complete, valid operational baseline and current audiogram before clinical review.",
      evaluatedAt,
    };
  }

  const triggeredFindings: HearingFinding[] = comparison.comparisons
    .filter(
      (item) => item.differenceDb >= THAI_HEARING_RULE_2561.thresholdShiftDb,
    )
    .map((item) => ({ ...item, criterion: CRITERION }));

  if (triggeredFindings.length === 0) {
    return {
      ruleCode: THAI_HEARING_RULE_2561.code,
      ruleName: THAI_HEARING_RULE_2561.name,
      ruleVersion: THAI_HEARING_RULE_2561.version,
      status: "negative",
      triggeredFindings,
      notEvaluableReasons: [],
      explanation:
        "No monitored threshold deteriorated by 15 dB HL or more compared with the operational baseline.",
      recommendedAction: "Continue scheduled hearing surveillance.",
      evaluatedAt,
    };
  }

  return {
    ruleCode: THAI_HEARING_RULE_2561.code,
    ruleName: THAI_HEARING_RULE_2561.name,
    ruleVersion: THAI_HEARING_RULE_2561.version,
    status: "positive",
    triggeredFindings,
    notEvaluableReasons: [],
    explanation: `Hearing threshold shift detected. ${triggeredFindings
      .map(findingExplanation)
      .join(" ")}`,
    recommendedAction:
      "Repeat audiometry within 30 days and arrange occupational physician review as indicated.",
    evaluatedAt,
  };
}
