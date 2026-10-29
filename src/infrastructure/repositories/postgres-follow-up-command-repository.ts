import "server-only";

import type { FollowUpCommandRepository } from "@/application/ports/follow-up-command-repository";
import type { FollowUpCaseStatus } from "@/application/view-models";
import { createDatabaseClient } from "@/infrastructure/postgres/server-client";

export class PostgresFollowUpCommandRepository
  implements FollowUpCommandRepository
{
  async advanceStatus(
    caseId: string,
    newStatus: FollowUpCaseStatus,
  ): Promise<void> {
    const client = await createDatabaseClient();
    const response = await client.rpc(
      "advance_follow_up_case",
      {
        p_case_id: caseId,
        p_new_status: newStatus,
      },
    );

    if (response.error) {
      throw new Error(`Unable to advance follow-up case: ${response.error.message}`);
    }
  }
}
