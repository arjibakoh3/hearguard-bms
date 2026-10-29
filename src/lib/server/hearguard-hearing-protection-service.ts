import "server-only";

import { HearGuardHearingProtectionService } from "@/application/hearguard-hearing-protection-service";
import { SupabaseHearingProtectionRepository } from "@/infrastructure/repositories/supabase-hearing-protection-repository";

export function getHearGuardHearingProtectionService(): HearGuardHearingProtectionService {
  return new HearGuardHearingProtectionService(
    new SupabaseHearingProtectionRepository(),
  );
}
