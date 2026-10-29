import type { NihlEvidenceResult } from "@/domain/hearing";
import type {
  NihlEvidenceWorkspace,
  NihlPhysicianReviewInput,
  NoiseExposurePeriodInput,
  NihlReviewAmendmentInput,
  NihlReviewAmendmentResult,
} from "../nihl-evidence-models";

export interface NihlEvidenceRepository {
  getWorkspace(employeeId: string, currentAudiogramId?: string | null): Promise<NihlEvidenceWorkspace | null>;
  saveExposurePeriod(input: NoiseExposurePeriodInput): Promise<string>;
  persistAssessment(employeeId: string, audiogramId: string, result: NihlEvidenceResult): Promise<string>;
  reviewAssessment(input: NihlPhysicianReviewInput): Promise<string>;
  amendReview(input: NihlReviewAmendmentInput): Promise<NihlReviewAmendmentResult>;
}
