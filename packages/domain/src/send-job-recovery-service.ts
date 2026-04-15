import { sql } from "drizzle-orm";
import { type Database } from "@smartsend/db";

import { refreshCampaignStatus } from "./send-job-processing-service.js";

export const defaultSendJobLockTimeoutMs = 15 * 60 * 1000;
export const recoveryPendingErrorCode = "RECOVERY_LOCK_TIMEOUT";
export const recoveryFailedErrorCode = "RECOVERY_LOCK_TIMEOUT_MAX_ATTEMPTS";

type RecoverStuckProcessingSendJobsInput = {
  lockTimeoutMs?: number;
  now?: Date;
};

type RecoveredSendJobRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  status: "pending" | "failed";
};

export type RecoverStuckProcessingSendJobsResult = {
  failedCount: number;
  pendingCount: number;
  timedOutBefore: string;
  touchedCampaignCount: number;
  touchedSendJobIds: string[];
};

export function isSendJobLockTimedOut(
  lockedAt: Date | null,
  now: Date,
  lockTimeoutMs: number,
) {
  if (!lockedAt) {
    return false;
  }

  return lockedAt.getTime() <= now.getTime() - lockTimeoutMs;
}

export async function recoverStuckProcessingSendJobs(
  db: Database,
  input: RecoverStuckProcessingSendJobsInput = {},
): Promise<RecoverStuckProcessingSendJobsResult> {
  const now = input.now ?? new Date();
  const lockTimeoutMs = input.lockTimeoutMs ?? defaultSendJobLockTimeoutMs;
  const timedOutBefore = new Date(now.getTime() - lockTimeoutMs);
  const nowIso = now.toISOString();
  const timedOutBeforeIso = timedOutBefore.toISOString();

  const recovered = await db.transaction(async (tx) => {
    const updated = await tx.execute(sql`
      update send_jobs
      set
        status = case
          when attempt_count + 1 >= max_attempts then 'failed'::send_job_status
          else 'pending'::send_job_status
        end,
        attempt_count = attempt_count + 1,
        scheduled_at = case
          when attempt_count + 1 >= max_attempts then scheduled_at
          else ${nowIso}::timestamp with time zone
        end,
        processed_at = case
          when attempt_count + 1 >= max_attempts then ${nowIso}::timestamp with time zone
          else null
        end,
        locked_at = null,
        locked_by = null,
        last_error_code = case
          when attempt_count + 1 >= max_attempts then ${recoveryFailedErrorCode}
          else ${recoveryPendingErrorCode}
        end,
        last_error_message = case
          when attempt_count + 1 >= max_attempts
            then 'Recovered timed-out processing job and failed it because max attempts were exhausted.'
          else 'Recovered timed-out processing job back to pending.'
        end,
        updated_at = ${nowIso}::timestamp with time zone
      where status = 'processing'
        and processed_at is null
        and locked_at is not null
        and locked_at <= ${timedOutBeforeIso}::timestamp with time zone
      returning id, workspace_id, campaign_id, status;
    `);

    const rows = extractRows<RecoveredSendJobRow>(updated);
    const campaignKeys = new Map<string, { workspaceId: string; campaignId: string }>();

    for (const row of rows) {
      campaignKeys.set(`${row.workspace_id}:${row.campaign_id}`, {
        workspaceId: row.workspace_id,
        campaignId: row.campaign_id,
      });
    }

    for (const campaign of campaignKeys.values()) {
      await refreshCampaignStatus(
        tx as unknown as Database,
        campaign.workspaceId,
        campaign.campaignId,
      );
    }

    return rows;
  });

  return {
    failedCount: recovered.filter((row) => row.status === "failed").length,
    pendingCount: recovered.filter((row) => row.status === "pending").length,
    timedOutBefore: timedOutBefore.toISOString(),
    touchedCampaignCount: new Set(
      recovered.map((row) => `${row.workspace_id}:${row.campaign_id}`),
    ).size,
    touchedSendJobIds: recovered.map((row) => row.id),
  };
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as T[];
    }
  }

  return [];
}
