import "server-only";

import { HearGuardBaselineGovernanceService } from "@/application/hearguard-baseline-governance-service";
import { SupabaseBaselineGovernanceCommandRepository } from "@/infrastructure/repositories/supabase-baseline-governance-command-repository";

export function getHearGuardBaselineGovernanceService() {
  return new HearGuardBaselineGovernanceService(
    new SupabaseBaselineGovernanceCommandRepository(),
  );
}
