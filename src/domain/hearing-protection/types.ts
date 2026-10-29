export type HearingProtectorType =
  | "EARMUFF"
  | "FOAM_EARPLUG"
  | "OTHER_EARPLUG";

export type NoiseExposureBasis =
  | "EIGHT_HOUR_TWA"
  | "SHIFT_AVERAGE"
  | "UNSPECIFIED";

export type HearingProtectionStatus =
  | "ADEQUATE"
  | "INADEQUATE"
  | "INSUFFICIENT_DATA"
  | "NOT_EVALUABLE";

export type HearingProtectionMethod =
  | "THAI_NRR_DBA"
  | "THAI_NRR_DBC"
  | "THAI_SNR";

export type HearingProtectorRating = {
  id?: string;
  manufacturer?: string;
  model?: string;
  protectorType: HearingProtectorType;
  nrrDb: number | null;
  snrDb: number | null;
};

export type HearingProtectionExposure = {
  id?: string;
  levelDbA: number | null;
  levelDbC: number | null;
  shiftHours: number | null;
  basis: NoiseExposureBasis;
};

export type HearingProtectionAssessmentInput = {
  exposure: HearingProtectionExposure | null;
  protector: HearingProtectorRating | null;
  configuration: "SINGLE" | "DUAL_UNSUPPORTED";
  secondaryProtector?: HearingProtectorRating | null;
  assessedAt: string;
};

export type HearingProtectionCalculation = {
  method: HearingProtectionMethod;
  status: "CALCULATED" | "INSUFFICIENT_DATA";
  measuredExposureDb: number | null;
  measurementWeighting: "A" | "C" | null;
  labelledRatingDb: number | null;
  ratingKind: "NRR" | "SNR";
  protectorType: HearingProtectorType;
  deratingFactor: number | null;
  adjustedNrrDb: number | null;
  weightingCorrectionDb: number | null;
  effectiveAttenuationDb: number | null;
  protectedExposureDbA: number | null;
  formula: string;
  explanation: string;
};

export type ThaiAllowableExposure = {
  shiftHours: number;
  allowableExposureDbA: number;
  source: "OFFICIAL_TABLE" | "FORMULA_CONSERVATIVE_FLOOR";
  unroundedDbA: number;
};

export type HearingProtectionAssessment = {
  status: HearingProtectionStatus;
  protectedExposureDbA: number | null;
  allowableExposureDbA: number | null;
  protectionMarginDb: number | null;
  governingMethod: HearingProtectionMethod | null;
  calculations: HearingProtectionCalculation[];
  reasons: string[];
  ruleCode: string;
  ruleVersion: string;
  assessedAt: string;
};
