import "server-only";

import { HearGuardReadService } from "@/application/hearguard-read-service";
import { PostgresHearGuardReadRepository } from "@/infrastructure/repositories/postgres-hearguard-read-repository";

export function getHearGuardReadService(): HearGuardReadService {
  return new HearGuardReadService(new PostgresHearGuardReadRepository());
}
