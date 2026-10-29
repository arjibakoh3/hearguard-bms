import "server-only";

import { z } from "zod";
import type {
  BaselineGovernanceCommandRepository,
  BaselineReviewDecision,
  BaselineReviewResult,
} from "@/application/ports/baseline-governance-command-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

const ReviewResultSchema = z.object({
  suggestionId: z.string().uuid(),
  reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "DEFERRED"]),
  newBaselineHistoryId: z.string().uuid().nullable(),
  thaiOperationalBaselineChanged: z.boolean(),
  thaiFollowUpMutated: z.literal(false),
});

export class SupabaseBaselineGovernanceCommandRepository
  implements BaselineGovernanceCommandRepository
{
  async createSuggestions(input: Parameters<BaselineGovernanceCommandRepository["createSuggestions"]>[0]): Promise<number> {
    if (input.length === 0) return 0;
    const client = await createSupabaseServerClient();
    const response = await client.rpc("replace_analytical_baseline_suggestions", {
      p_suggestions: input,
    });
    if (response.error) {
      throw new Error(`Unable to refresh baseline suggestions: ${response.error.message}`);
    }
    return z.object({ created: z.number().int().nonnegative() }).parse(response.data).created;
  }

  async reviewSuggestion(
    suggestionId: string,
    decision: BaselineReviewDecision,
    reviewNote: string,
  ): Promise<BaselineReviewResult> {
    const client = await createSupabaseServerClient();
    const response = await client.rpc("review_baseline_suggestion", {
      p_suggestion_id: suggestionId,
      p_decision: decision,
      p_review_note: reviewNote,
    });
    if (response.error) {
      throw new Error(`Unable to review baseline suggestion: ${response.error.message}`);
    }
    return ReviewResultSchema.parse(response.data);
  }
}
