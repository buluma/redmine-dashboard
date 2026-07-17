import { prisma } from "@/src/lib/db";

/**
 * Acquire (or renew) a named leader lock backed by the LeaderLock table.
 * Returns true when the caller is the new or current holder.
 *
 * Lock is granted when:
 *   - no record exists yet (first caller wins)
 *   - ownerId matches the existing record (renewal)
 *   - the existing record has expired (takeover)
 *
 * The grant is done atomically. A conditional `updateMany` claims the row only
 * when it is ours or already expired; if nothing matched we try to `create` it,
 * and a concurrent creator losing that race trips the unique constraint on
 * `name`. This avoids the read-then-write window where two pollers could both
 * observe an expired lock and both believe they became leader.
 */
export async function acquireLeaderLock(
  lockName: string,
  ownerId: string,
  ttlMs: number,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  // Renew (ours) or take over (expired) in a single conditional write. A row
  // held by a live, different owner does not match and is left untouched.
  const claimed = await prisma.leaderLock.updateMany({
    where: {
      name: lockName,
      OR: [{ ownerId }, { expiresAt: { lt: now } }],
    },
    data: { ownerId, heartbeatAt: now, expiresAt },
  });
  if (claimed.count > 0) {
    return true;
  }

  // Nothing matched: either the lock doesn't exist yet, or it's held by a live
  // owner. Attempt to create it — success means we won a first-run race; a
  // P2002 means the row already exists (held by someone else), so we lost.
  try {
    await prisma.leaderLock.create({
      data: { name: lockName, ownerId, heartbeatAt: now, expiresAt },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return false;
    }
    throw error;
  }
}
