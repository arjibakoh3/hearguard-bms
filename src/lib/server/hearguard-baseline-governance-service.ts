import "server-only";

import { HearGuardBaselineGovernanceService } from "@/application/hearguard-baseline-governance-service";
import { PostgresBaselineGovernanceCommandRepository } from "@/infrastructure/repositories/postgres-baseline-governance-command-repository";

export function getHearGuardBaselineGovernanceService() {
  return new HearGuardBaselineGovernanceService(
    new PostgresBaselineGovernanceCommandRepository(),
  );
}
