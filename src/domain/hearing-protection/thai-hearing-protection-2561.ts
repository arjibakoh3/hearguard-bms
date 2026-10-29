import type {
  HearingProtectionAssessment,
  HearingProtectionAssessmentInput,
  HearingProtectionCalculation,
  HearingProtectionMethod,
  HearingProtectorType,
  ThaiAllowableExposure,
} from "./types";

export const THAI_HEARING_PROTECTION_RULE_2561 = {
  code: "THAI_HEARING_PROTECTION_2561",
  version: "1.0.0",
  name: "Thai hearing protection effectiveness estimate B.E. 2561",
  referenceTitle:
    "ประกาศกรมสวัสดิการและคุ้มครองแรงงาน เรื่อง การคำนวณระดับเสียงที่สัมผัสในหูเมื่อสวมใส่อุปกรณ์คุ้มครองความปลอดภัยส่วนบุคคล พ.ศ. 2561",
} as const;

export const THAI_NRR_DERATING_FACTORS: Readonly<
  Record<HearingProtectorType, number>
> = {
  EARMUFF: 0.75,
  FOAM_EARPLUG: 0.5,
  OTHER_EARPLUG: 0.3,
};

const OFFICIAL_ALLOWABLE_DURATION_MINUTES = new Map<number, number>([
  [82, 960],
  [83, 762],
  [84, 605],
  [85, 480],
  [86, 381],
  [87, 302],
  [88, 240],
  [89, 191],
  [90, 151],
  [91, 120],
  [92, 95],
  [93, 76],
  [94, 60],
  [95, 48],
  [96, 38],
  [97, 30],
  [98, 24],
  [99, 19],
  [100, 15],
  [101, 12],
  [102, 9],
  [103, 7.5],
  [104, 6],
  [105, 5],
  [106, 4],
  [107, 3],
  [108, 2.5],
  [109, 2],
  [110, 1.5],
  [111, 1],
]);

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function getThaiAllowableDurationHours(levelDbA: number): number {
  if (!Number.isFinite(levelDbA)) {
    throw new Error("Noise level must be a finite number");
  }

  const officialMinutes = Number.isInteger(levelDbA)
    ? OFFICIAL_ALLOWABLE_DURATION_MINUTES.get(levelDbA)
    : undefined;
  if (officialMinutes !== undefined) return officialMinutes / 60;

  return 8 / 2 ** ((levelDbA - 85) / 3);
}

export function getThaiAllowableExposureDbA(
  shiftHours: number,
): ThaiAllowableExposure {
  if (!Number.isFinite(shiftHours) || shiftHours <= 0) {
    throw new Error("Shift duration must be greater than zero");
  }

  const matchingTableEntry = [...OFFICIAL_ALLOWABLE_DURATION_MINUTES.entries()]
    .find(([, minutes]) => Math.abs(minutes / 60 - shiftHours) < 1e-9);
  if (matchingTableEntry) {
    return {
      shiftHours,
      allowableExposureDbA: matchingTableEntry[0],
      source: "OFFICIAL_TABLE",
      unroundedDbA: matchingTableEntry[0],
    };
  }

  const unroundedDbA = 85 + 3 * Math.log2(8 / shiftHours);
  return {
    shiftHours,
    allowableExposureDbA: Math.floor(unroundedDbA + Number.EPSILON),
    source: "FORMULA_CONSERVATIVE_FLOOR",
    unroundedDbA,
  };
}

function unavailableCalculation(
  method: HearingProtectionMethod,
  protectorType: HearingProtectorType,
  ratingKind: "NRR" | "SNR",
  labelledRatingDb: number | null,
  explanation: string,
): HearingProtectionCalculation {
  return {
    method,
    status: "INSUFFICIENT_DATA",
    measuredExposureDb: null,
    measurementWeighting: null,
    labelledRatingDb,
    ratingKind,
    protectorType,
    deratingFactor: null,
    adjustedNrrDb: null,
    weightingCorrectionDb: null,
    effectiveAttenuationDb: null,
    protectedExposureDbA: null,
    formula: "Not calculated",
    explanation,
  };
}

function calculateNrr(
  method: "THAI_NRR_DBA" | "THAI_NRR_DBC",
  measuredExposureDb: number,
  protectorType: HearingProtectorType,
  labelledNrrDb: number,
): HearingProtectionCalculation {
  const deratingFactor = THAI_NRR_DERATING_FACTORS[protectorType];
  const adjustedNrrDb = round(labelledNrrDb * deratingFactor);
  const usesAWeighting = method === "THAI_NRR_DBA";
  const effectiveAttenuationDb = round(
    usesAWeighting ? adjustedNrrDb - 7 : adjustedNrrDb,
  );
  const protectedExposureDbA = round(
    measuredExposureDb - effectiveAttenuationDb,
  );

  return {
    method,
    status: "CALCULATED",
    measuredExposureDb,
    measurementWeighting: usesAWeighting ? "A" : "C",
    labelledRatingDb: labelledNrrDb,
    ratingKind: "NRR",
    protectorType,
    deratingFactor,
    adjustedNrrDb,
    weightingCorrectionDb: usesAWeighting ? 7 : 0,
    effectiveAttenuationDb,
    protectedExposureDbA,
    formula: usesAWeighting
      ? "Protected dBA = dBA - (NRRadj - 7)"
      : "Protected dBA = dBC - NRRadj",
    explanation: usesAWeighting
      ? `${measuredExposureDb} - (${adjustedNrrDb} - 7) = ${protectedExposureDbA} dBA`
      : `${measuredExposureDb} - ${adjustedNrrDb} = ${protectedExposureDbA} dBA`,
  };
}

function calculateSnr(
  measuredExposureDbC: number,
  protectorType: HearingProtectorType,
  labelledSnrDb: number,
): HearingProtectionCalculation {
  const protectedExposureDbA = round(measuredExposureDbC - labelledSnrDb + 4);
  return {
    method: "THAI_SNR",
    status: "CALCULATED",
    measuredExposureDb: measuredExposureDbC,
    measurementWeighting: "C",
    labelledRatingDb: labelledSnrDb,
    ratingKind: "SNR",
    protectorType,
    deratingFactor: null,
    adjustedNrrDb: null,
    weightingCorrectionDb: 4,
    effectiveAttenuationDb: round(labelledSnrDb - 4),
    protectedExposureDbA,
    formula: "Protected dBA = (LC - SNR) + 4",
    explanation: `(${measuredExposureDbC} - ${labelledSnrDb}) + 4 = ${protectedExposureDbA} dBA`,
  };
}

function resultWithoutCalculation(
  input: HearingProtectionAssessmentInput,
  status: "INSUFFICIENT_DATA" | "NOT_EVALUABLE",
  reasons: string[],
): HearingProtectionAssessment {
  return {
    status,
    protectedExposureDbA: null,
    allowableExposureDbA: null,
    protectionMarginDb: null,
    governingMethod: null,
    calculations: [],
    reasons,
    ruleCode: THAI_HEARING_PROTECTION_RULE_2561.code,
    ruleVersion: THAI_HEARING_PROTECTION_RULE_2561.version,
    assessedAt: input.assessedAt,
  };
}

export function assessHearingProtection(
  input: HearingProtectionAssessmentInput,
): HearingProtectionAssessment {
  if (input.configuration === "DUAL_UNSUPPORTED") {
    return resultWithoutCalculation(input, "NOT_EVALUABLE", [
      "Simultaneous plug-and-muff protection is not supported because no approved Thai dual-protection rule is implemented.",
    ]);
  }
  if (!input.exposure) {
    return resultWithoutCalculation(input, "INSUFFICIENT_DATA", [
      "No applicable noise exposure record.",
    ]);
  }
  if (!input.protector) {
    return resultWithoutCalculation(input, "INSUFFICIENT_DATA", [
      "No hearing protector assignment.",
    ]);
  }

  const { exposure, protector } = input;
  const calculations: HearingProtectionCalculation[] = [];
  const reasons: string[] = [];

  if (protector.nrrDb !== null) {
    if (exposure.levelDbA !== null) {
      calculations.push(
        calculateNrr(
          "THAI_NRR_DBA",
          exposure.levelDbA,
          protector.protectorType,
          protector.nrrDb,
        ),
      );
    }
    if (exposure.levelDbC !== null) {
      calculations.push(
        calculateNrr(
          "THAI_NRR_DBC",
          exposure.levelDbC,
          protector.protectorType,
          protector.nrrDb,
        ),
      );
    }
    if (exposure.levelDbA === null && exposure.levelDbC === null) {
      calculations.push(unavailableCalculation(
        "THAI_NRR_DBA",
        protector.protectorType,
        "NRR",
        protector.nrrDb,
        "An A- or C-weighted exposure is required for NRR assessment.",
      ));
    }
  }

  if (protector.snrDb !== null) {
    if (exposure.levelDbC !== null) {
      calculations.push(
        calculateSnr(
          exposure.levelDbC,
          protector.protectorType,
          protector.snrDb,
        ),
      );
    } else {
      calculations.push(unavailableCalculation(
        "THAI_SNR",
        protector.protectorType,
        "SNR",
        protector.snrDb,
        "C-weighted exposure is required for SNR assessment.",
      ));
    }
  }

  if (protector.nrrDb === null && protector.snrDb === null) {
    reasons.push("Insufficient hearing protector attenuation data.");
  }

  const calculated = calculations.filter(
    (calculation): calculation is HearingProtectionCalculation & {
      protectedExposureDbA: number;
    } => calculation.protectedExposureDbA !== null,
  );
  if (calculated.length === 0) {
    reasons.push(
      ...calculations.map((calculation) => calculation.explanation),
    );
    return {
      ...resultWithoutCalculation(input, "INSUFFICIENT_DATA", reasons),
      calculations,
    };
  }

  const governing = calculated.reduce((highest, calculation) =>
    calculation.protectedExposureDbA > highest.protectedExposureDbA
      ? calculation
      : highest,
  );

  let allowable: ThaiAllowableExposure | null = null;
  if (exposure.shiftHours === null) {
    reasons.push("Shift duration is required to determine legal adequacy.");
  } else if (exposure.basis === "UNSPECIFIED") {
    reasons.push(
      "Exposure basis is unspecified; historical TWA data are not assumed to be an 8-hour TWA.",
    );
  } else if (
    exposure.basis === "EIGHT_HOUR_TWA"
    && Math.abs(exposure.shiftHours - 8) > 1e-9
  ) {
    reasons.push(
      "Exposure basis is 8-hour TWA but the recorded shift duration is not 8 hours.",
    );
  } else {
    allowable = getThaiAllowableExposureDbA(exposure.shiftHours);
  }

  if (!allowable) {
    return {
      status: "INSUFFICIENT_DATA",
      protectedExposureDbA: governing.protectedExposureDbA,
      allowableExposureDbA: null,
      protectionMarginDb: null,
      governingMethod: governing.method,
      calculations,
      reasons,
      ruleCode: THAI_HEARING_PROTECTION_RULE_2561.code,
      ruleVersion: THAI_HEARING_PROTECTION_RULE_2561.version,
      assessedAt: input.assessedAt,
    };
  }

  const protectionMarginDb = round(
    allowable.allowableExposureDbA - governing.protectedExposureDbA,
  );
  return {
    status: protectionMarginDb >= 0 ? "ADEQUATE" : "INADEQUATE",
    protectedExposureDbA: governing.protectedExposureDbA,
    allowableExposureDbA: allowable.allowableExposureDbA,
    protectionMarginDb,
    governingMethod: governing.method,
    calculations,
    reasons,
    ruleCode: THAI_HEARING_PROTECTION_RULE_2561.code,
    ruleVersion: THAI_HEARING_PROTECTION_RULE_2561.version,
    assessedAt: input.assessedAt,
  };
}
