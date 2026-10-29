export function calculateObservedPercentage(
  numerator: number,
  denominator: number,
): number {
  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    numerator < 0 ||
    denominator < 0 ||
    numerator > denominator
  ) {
    throw new Error("Population surveillance counts are invalid");
  }

  if (denominator === 0) return 0;
  return Math.round(((100 * numerator) / denominator) * 10) / 10;
}

/**
 * Data-relative attention flag only. It is not a predictive risk score and
 * does not establish work-related or noise-related causation.
 */
export function isPotentialDeteriorationCluster(
  departmentShiftCount: number,
  departmentPrevalencePct: number,
  organizationPrevalencePct: number,
): boolean {
  return (
    departmentShiftCount > 0 &&
    departmentPrevalencePct > organizationPrevalencePct
  );
}
