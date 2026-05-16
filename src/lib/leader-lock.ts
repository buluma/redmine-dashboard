import { prisma } from "@/src/lib/db";

/**
 * Acquire (or renew) a named leader lock backed by the LeaderLock table.
 * Returns true when the caller is the new or current holder.
 *
 * Lock is granted when:
 *   - no record exists yet (first caller wins)
 *   - ownerId matches the existing record (renewal)
 *   - the existing record has expired (takeover)
 */
export async function acquireLeaderLock(
  lockName: string,
  ownerId: string,
  ttlMs: number,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const current = await prisma.leaderLock.findUnique({ where: { name: lockName } });

  if (!current) {
    await prisma.leaderLock.create({
      data: { name: lockName, ownerId, heartbeatAt: now, expiresAt },
    });
    return true;
  }

  const lockExpired = current.expiresAt.getTime() < Date.now();
  if (current.ownerId === ownerId || lockExpired) {
    await prisma.leaderLock.update({
      where: { name: lockName },
      data: { ownerId, heartbeatAt: now, expiresAt },
    });
    return true;
  }

  return false;
}
