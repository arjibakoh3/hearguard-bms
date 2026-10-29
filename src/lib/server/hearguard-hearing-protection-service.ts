import "server-only";

import { HearGuardHearingProtectionService } from "@/application/hearguard-hearing-protection-service";
import { PostgresHearingProtectionRepository } from "@/infrastructure/repositories/postgres-hearing-protection-repository";

export function getHearGuardHearingProtectionService(): HearGuardHearingProtectionService {
  return new HearGuardHearingProtectionService(
    new PostgresHearingProtectionRepository(),
  );
}
