import { evaluateNihlEvidence } from "@/domain/hearing";
import {
  NihlPhysicianReviewInputSchema,
  NoiseExposurePeriodInputSchema,
  NihlReviewAmendmentInputSchema,
  type NihlReviewAmendmentInput,
  type NihlPhysicianReviewInput,
  type NoiseExposurePeriodInput,
} from "./nihl-evidence-models";
import type { NihlEvidenceRepository } from "./ports/nihl-evidence-repository";

export class HearGuardNihlEvidenceService {
  constructor(private readonly repository: NihlEvidenceRepository) {}

  getWorkspace(employeeId: string, currentAudiogramId?: string | null) {
    return this.repository.getWorkspace(employeeId, currentAudiogramId);
  }

  async saveExposurePeriod(rawInput: NoiseExposurePeriodInput) {
    const input = NoiseExposurePeriodInputSchema.parse(rawInput);
    const id = await this.repository.saveExposurePeriod(input);
    await this.refreshForEmployee(input.employeeId);
    return id;
  }

  async refreshForEmployee(employeeId: string, currentAudiogramId?: string | null) {
    const workspace = await this.repository.getWorkspace(employeeId, currentAudiogramId);
    if (!workspace?.currentAudiogram) return null;
    const result = evaluateNihlEvidence({
      currentAudiogram: workspace.currentAudiogram,
      longitudinalAudiograms: workspace.audiograms,
      exposurePeriods: workspace.exposurePeriods,
      alternativeContributors: workspace.alternativeContributors,
      accessLimited: workspace.accessLimited,
      identityScope: workspace.identity.identityScope,
    });
    const assessmentId = await this.repository.persistAssessment(
      workspace.currentAudiogram.employeeId ?? employeeId,
      workspace.currentAudiogram.id,
      result,
    );
    return { assessmentId, result };
  }

  reviewAssessment(rawInput: NihlPhysicianReviewInput) {
    return this.repository.reviewAssessment(NihlPhysicianReviewInputSchema.parse(rawInput));
  }

  amendReview(rawInput: NihlReviewAmendmentInput) {
    return this.repository.amendReview(NihlReviewAmendmentInputSchema.parse(rawInput));
  }
}
