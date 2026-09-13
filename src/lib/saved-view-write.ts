import { Prisma } from "@prisma/client";

import { prisma } from "@/src/lib/db";

const MAX_SERIALIZATION_RETRIES = 3;

/**
 * Run a saved-view mutation at serializable isolation. Count-then-create is
 * otherwise vulnerable to concurrent requests: an import can happen twice,
 * or two requests at the cap can both create a view. PostgreSQL reports the
 * losing transaction as P2034; retrying lets it observe the winner's state.
 */
export async function withSavedViewWrite<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt === MAX_SERIALIZATION_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new Error("Saved view transaction retry limit reached");
}
