import {
  HearingProtectorAssignmentInputSchema,
  HearingProtectorCatalogInputSchema,
  type HearingProtectorAssignmentInput,
  type HearingProtectorCatalogInput,
} from "./hearing-protection-models";
import type { HearingProtectionRepository } from "./ports/hearing-protection-repository";
import {
  assessHearingProtection,
  type HearingProtectorRating,
} from "@/domain/hearing-protection";

function protectorSnapshot(protector: HearingProtectorRating) {
  return {
    id: protector.id ?? null,
    manufacturer: protector.manufacturer ?? null,
    model: protector.model ?? null,
    protectorType: protector.protectorType,
    nrrDb: protector.nrrDb,
    snrDb: protector.snrDb,
  };
}

export class HearGuardHearingProtectionService {
  constructor(private readonly repository: HearingProtectionRepository) {}

  listOrganizationProtectors(organizationId: string) {
    return this.repository.listOrganizationProtectors(organizationId);
  }

  async upsertProtector(rawInput: HearingProtectorCatalogInput): Promise<string> {
    const input = HearingProtectorCatalogInputSchema.parse(rawInput);
    return this.repository.upsertProtector(input);
  }

  async assignProtector(
    rawInput: HearingProtectorAssignmentInput,
    assessedAt = new Date().toISOString(),
  ): Promise<{ assignmentId: string; assessmentId: string }> {
    const input = HearingProtectorAssignmentInputSchema.parse(rawInput);
    const context = await this.repository.getEmployeeContext(input.employeeId);
    if (!context) throw new Error("Employee not found or outside your organization access");

    const protector = context.protectors.find(
      (item) => item.id === input.hearingProtectorId,
    );
    if (!protector) throw new Error("Hearing protector is unavailable in this organization");
    const secondaryProtector = input.secondaryHearingProtectorId
      ? context.protectors.find(
          (item) => item.id === input.secondaryHearingProtectorId,
        )
      : null;
    if (input.secondaryHearingProtectorId && !secondaryProtector) {
      throw new Error("Secondary hearing protector is unavailable in this organization");
    }

    const assessment = assessHearingProtection({
      exposure: context.exposure,
      protector,
      configuration: input.configuration,
      secondaryProtector,
      assessedAt,
    });
    const inputSnapshot = {
      exposure: context.exposure
        ? {
            id: context.exposure.id ?? null,
            measurementDate: context.exposure.measurementDate,
            scope: context.exposure.scope,
            levelDbA: context.exposure.levelDbA,
            levelDbC: context.exposure.levelDbC,
            shiftHours: context.exposure.shiftHours,
            basis: context.exposure.basis,
          }
        : null,
      protector: protectorSnapshot(protector),
      secondaryProtector: secondaryProtector
        ? protectorSnapshot(secondaryProtector)
        : null,
      configuration: input.configuration,
      effectiveFrom: input.effectiveFrom,
    };

    return this.repository.assignAndRecordAssessment({
      input,
      organizationId: context.organizationId,
      exposureId: context.exposure?.id ?? null,
      assessment,
      inputSnapshot,
    });
  }
}
