import "server-only";

import { HearGuardNihlEvidenceService } from "@/application/hearguard-nihl-evidence-service";
import { PostgresNihlEvidenceRepository } from "@/infrastructure/repositories/postgres-nihl-evidence-repository";

export function getHearGuardNihlEvidenceService() {
  return new HearGuardNihlEvidenceService(new PostgresNihlEvidenceRepository());
}
