import "server-only";

import { HearGuardFollowUpService } from "@/application/hearguard-follow-up-service";
import { PostgresFollowUpCommandRepository } from "@/infrastructure/repositories/postgres-follow-up-command-repository";

export function getHearGuardFollowUpService(): HearGuardFollowUpService {
  return new HearGuardFollowUpService(
    new PostgresFollowUpCommandRepository(),
  );
}
