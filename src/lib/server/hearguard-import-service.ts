import "server-only";

import { HearGuardImportService } from "@/application/hearguard-import-service";
import { PostgresHearGuardImportRepository } from "@/infrastructure/repositories/postgres-hearguard-import-repository";

export function getHearGuardImportService(): HearGuardImportService {
  return new HearGuardImportService(
    new PostgresHearGuardImportRepository(),
  );
}
