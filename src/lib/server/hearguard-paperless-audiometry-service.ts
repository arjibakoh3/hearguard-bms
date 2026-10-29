import "server-only";

import { HearGuardBaselineGovernanceService } from "@/application/hearguard-baseline-governance-service";
import { HearGuardPaperlessAudiometryService } from "@/application/hearguard-paperless-audiometry-service";
import { HearGuardReadService } from "@/application/hearguard-read-service";
import { PostgresBaselineGovernanceCommandRepository } from "@/infrastructure/repositories/postgres-baseline-governance-command-repository";
import { PostgresHearGuardReadRepository } from "@/infrastructure/repositories/postgres-hearguard-read-repository";
import { PostgresPaperlessAudiometryRepository } from "@/infrastructure/repositories/postgres-paperless-audiometry-repository";
import { getHearGuardNihlEvidenceService } from "./hearguard-nihl-evidence-service";

export function getHearGuardPaperlessAudiometryService() {
  return new HearGuardPaperlessAudiometryService(
    new PostgresPaperlessAudiometryRepository(),
    new HearGuardReadService(new PostgresHearGuardReadRepository()),
    new HearGuardBaselineGovernanceService(
      new PostgresBaselineGovernanceCommandRepository(),
    ),
    getHearGuardNihlEvidenceService(),
  );
}
