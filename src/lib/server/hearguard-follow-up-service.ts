import "server-only";

import { HearGuardFollowUpService } from "@/application/hearguard-follow-up-service";
import { SupabaseFollowUpCommandRepository } from "@/infrastructure/repositories/supabase-follow-up-command-repository";

export function getHearGuardFollowUpService(): HearGuardFollowUpService {
  return new HearGuardFollowUpService(
    new SupabaseFollowUpCommandRepository(),
  );
}
