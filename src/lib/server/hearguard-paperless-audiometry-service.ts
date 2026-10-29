import "server-only";

import { HearGuardBaselineGovernanceService } from "@/application/hearguard-baseline-governance-service";
import { HearGuardPaperlessAudiometryService } from "@/application/hearguard-paperless-audiometry-service";
import { HearGuardReadService } from "@/application/hearguard-read-service";
import { SupabaseBaselineGovernanceCommandRepository } from "@/infrastructure/repositories/supabase-baseline-governance-command-repository";
import { SupabaseHearGuardReadRepository } from "@/infrastructure/repositories/supabase-hearguard-read-repository";
import { SupabasePaperlessAudiometryRepository } from "@/infrastructure/repositories/supabase-paperless-audiometry-repository";
import { getHearGuardNihlEvidenceService } from "./hearguard-nihl-evidence-service";

export function getHearGuardPaperlessAudiometryService() {
  return new HearGuardPaperlessAudiometryService(
    new SupabasePaperlessAudiometryRepository(),
    new HearGuardReadService(new SupabaseHearGuardReadRepository()),
    new HearGuardBaselineGovernanceService(
      new SupabaseBaselineGovernanceCommandRepository(),
    ),
    getHearGuardNihlEvidenceService(),
  );
}
