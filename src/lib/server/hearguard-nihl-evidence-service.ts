import "server-only";

import { HearGuardNihlEvidenceService } from "@/application/hearguard-nihl-evidence-service";
import { SupabaseNihlEvidenceRepository } from "@/infrastructure/repositories/supabase-nihl-evidence-repository";

export function getHearGuardNihlEvidenceService() {
  return new HearGuardNihlEvidenceService(new SupabaseNihlEvidenceRepository());
}
