import { z } from "zod";

export const EARS = ["LEFT", "RIGHT"] as const;
export const SUPPORTED_FREQUENCIES_HZ = [
  500, 1000, 2000, 3000, 4000, 6000, 8000,
] as const;

export const EarSchema = z.enum(EARS);
export const FrequencyHzSchema = z.union(
  SUPPORTED_FREQUENCIES_HZ.map((frequency) => z.literal(frequency)),
);

export const AudiogramThresholdSchema = z.object({
  ear: EarSchema,
  frequencyHz: FrequencyHzSchema,
  thresholdDbHl: z.number().min(-20).max(140),
});

export const AudiogramThresholdObservationSchema = z.discriminatedUnion(
  "responseStatus",
  [
    z.object({
      ear: EarSchema,
      frequencyHz: FrequencyHzSchema,
      responseStatus: z.literal("MEASURED"),
      thresholdDbHl: z.number().min(-20).max(140),
    }),
    z.object({
      ear: EarSchema,
      frequencyHz: FrequencyHzSchema,
      responseStatus: z.literal("NO_RESPONSE"),
      noResponseAtDbHl: z.number().min(-20).max(140),
    }),
    z.object({
      ear: EarSchema,
      frequencyHz: FrequencyHzSchema,
      responseStatus: z.literal("NOT_TESTED"),
    }),
  ],
);

export const AudiogramSchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  examType: z.enum(["BASELINE", "ANNUAL", "REPEAT", "CONFIRMATION", "OTHER"]),
  hoursSinceNoiseExposure: z.number().min(0).max(168).optional(),
  isValid: z.boolean(),
  validationNotes: z.string().optional(),
  thresholds: z.array(AudiogramThresholdSchema),
});

export type Ear = z.infer<typeof EarSchema>;
export type FrequencyHz = z.infer<typeof FrequencyHzSchema>;
export type AudiogramThreshold = z.infer<typeof AudiogramThresholdSchema>;
export type AudiogramThresholdObservation = z.infer<
  typeof AudiogramThresholdObservationSchema
>;
export type Audiogram = z.infer<typeof AudiogramSchema>;

export function measuredThresholdsFromObservations(
  observations: readonly AudiogramThresholdObservation[],
): AudiogramThreshold[] {
  return observations.flatMap((observation) =>
    observation.responseStatus === "MEASURED"
      ? [{
          ear: observation.ear,
          frequencyHz: observation.frequencyHz,
          thresholdDbHl: observation.thresholdDbHl,
        }]
      : [],
  );
}
