import { Prisma } from "@prisma/client";

import { prisma } from "@/src/lib/db";
import { trackFailure, trackWarn } from "@/src/lib/telemetry";

const MAX_SERIALIZATION_RETRIES = 3;
// Small randomized backoff so losers of a serialization conflict don't all
// retry in lockstep and immediately collide again.
const RETRY_BASE_DELAY_MS = 20;

function retryDelayMs(attempt: number): number {
  return attempt * RETRY_BASE_DELAY_MS + Math.floor(Math.random() * RETRY_BASE_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thrown when a serializable write keeps losing to concurrent writers past
 * the retry budget — distinct from an ordinary failure so callers can return
 * a specific "retry me" response instead of an opaque 500. */
export class SavedViewWriteConflictError extends Error {
  constructor() {
    super("Too many concurrent saved-view writes — please retry");
    this.name = "SavedViewWriteConflictError";
  }
}

/**
 * Run a saved-view mutation at serializable isolation. Count-then-create is
 * otherwise vulnerable to concurrent requests: an import can happen twice,
 * or two requests at the cap can both create a view. PostgreSQL reports the
 * losing transaction as P2034; retrying lets it observe the winner's state.
 */
export async function withSavedViewWrite<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034") {
        throw error;
      }
      attempt++;
      if (attempt >= MAX_SERIALIZATION_RETRIES) {
        trackFailure({
          event: "saved_views.write_conflict_exhausted",
          error,
          metricName: "saved_views_write_conflict_exhausted",
        });
        throw new SavedViewWriteConflictError();
      }
      trackWarn("saved_views.write_conflict_retry", { attempt });
      await sleep(retryDelayMs(attempt));
    }
  }
}
