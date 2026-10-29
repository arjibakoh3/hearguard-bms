import "server-only";

import { HearGuardReadService } from "@/application/hearguard-read-service";
import { SupabaseHearGuardReadRepository } from "@/infrastructure/repositories/supabase-hearguard-read-repository";

export function getHearGuardReadService(): HearGuardReadService {
  return new HearGuardReadService(new SupabaseHearGuardReadRepository());
}
