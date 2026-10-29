import { z } from "zod";
import type { EvaluationSummary } from "@/application/view-models";
import { OSHA_STS_RULE_NAME } from "@/domain/hearing/rules/osha-sts";
import { FrequencyHzSchema } from "@/domain/hearing/types/audiogram";

const DatabaseNumberSchema = z.union([
  z.number(),
  z.string().transform((value) => Number(value)),
]);

export const EvaluationRowSchema = z.object({
  id: z.string().uuid(),
  current_audiogram_id: z.string().uuid(),
  baseline_audiogram_id: z.string().uuid().nullable(),
  status: z.enum(["POSITIVE", "NEGATIVE", "NOT_EVALUABLE"]),
  rule_version: z.string(),
  evaluation_result_json: z.unknown(),
  evaluated_at: z.string(),
});

const EvaluationPayloadSchema = z.object({
  ruleCode: z.string(),
  ruleName: z.string().optional(),
  ruleVersion: z.string().optional(),
  triggeredFindings: z
    .array(
      z.object({
        ear: z.enum(["LEFT", "RIGHT"]),
        frequencyHz: FrequencyHzSchema.optional(),
        frequenciesHz: z.array(FrequencyHzSchema).optional(),
        baselineDbHl: DatabaseNumberSchema.optional(),
        currentDbHl: DatabaseNumberSchema.optional(),
        baselineAverageDbHl: DatabaseNumberSchema.optional(),
        currentAverageDbHl: DatabaseNumberSchema.optional(),
        differenceDb: DatabaseNumberSchema,
        criterion: z.string(),
      }),
    )
    .optional(),
  earAverages: z
    .array(
      z.object({
        ear: z.enum(["LEFT", "RIGHT"]),
        frequenciesHz: z.array(FrequencyHzSchema),
        baselineAverageDbHl: DatabaseNumberSchema,
        currentAverageDbHl: DatabaseNumberSchema,
        differenceDb: DatabaseNumberSchema,
        criterion: z.string(),
      }),
    )
    .optional(),
  notEvaluableReasons: z.array(z.string()).optional(),
  recommendedAction: z.string().optional(),
  explanation: z.string().optional(),
});

export function mapEvaluation(
  row: z.infer<typeof EvaluationRowSchema>,
): EvaluationSummary {
  const parsed = EvaluationPayloadSchema.safeParse(row.evaluation_result_json);
  // Historical Beerthip OSHA snapshots omitted the display name. Do not
  // silently supply a name for an unrelated or malformed rule snapshot.
  const legacyOsha = parsed.success
    && parsed.data.ruleCode === "OSHA_STS_29_CFR_1910_95"
    && parsed.data.ruleName === undefined
    && parsed.data.ruleVersion === row.rule_version
    && parsed.data.triggeredFindings !== undefined
    && parsed.data.earAverages !== undefined
    && parsed.data.notEvaluableReasons !== undefined;
  const payload = parsed.success && (
    parsed.data.ruleName !== undefined
    || legacyOsha
  ) ? parsed.data : null;
  const status =
    row.status === "POSITIVE"
      ? "positive"
      : row.status === "NEGATIVE"
        ? "negative"
        : "not_evaluable";
  const findings = payload
    ? (payload.triggeredFindings ?? []).map((finding) => ({
        ear: finding.ear,
        frequenciesHz: finding.frequenciesHz ??
          (finding.frequencyHz ? [finding.frequencyHz] : []),
        baselineDbHl:
          finding.baselineDbHl ?? finding.baselineAverageDbHl ?? 0,
        currentDbHl:
          finding.currentDbHl ?? finding.currentAverageDbHl ?? 0,
        differenceDb: finding.differenceDb,
        criterion: finding.criterion,
      }))
    : [];
  const earAverages = payload
    ? (payload.earAverages ?? []).map((finding) => ({
        ear: finding.ear,
        frequenciesHz: finding.frequenciesHz,
        baselineDbHl: finding.baselineAverageDbHl,
        currentDbHl: finding.currentAverageDbHl,
        differenceDb: finding.differenceDb,
        criterion: finding.criterion,
      }))
    : [];

  return {
    id: row.id,
    currentAudiogramId: row.current_audiogram_id,
    baselineAudiogramId: row.baseline_audiogram_id,
    status,
    ruleCode: payload ? payload.ruleCode : "UNKNOWN_RULE",
    ruleName: payload
      ? (payload.ruleName ?? OSHA_STS_RULE_NAME)
      : "Unknown rule",
    ruleVersion: payload?.ruleVersion ?? row.rule_version,
    findingCount: findings.length,
    findings,
    earAverages,
    notEvaluableReasons: payload?.notEvaluableReasons ?? [],
    recommendedAction: payload?.recommendedAction ?? null,
    explanation: payload?.explanation ?? null,
    evaluatedAt: row.evaluated_at,
  };
}
