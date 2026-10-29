import "server-only";

import { HearGuardImportService } from "@/application/hearguard-import-service";
import { SupabaseHearGuardImportRepository } from "@/infrastructure/repositories/supabase-hearguard-import-repository";

export function getHearGuardImportService(): HearGuardImportService {
  return new HearGuardImportService(
    new SupabaseHearGuardImportRepository(),
  );
}
