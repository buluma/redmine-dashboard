import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acquireLeaderLock } from '../leader-lock';

const { mockUpdateMany, mockCreate } = vi.hoisted(() => ({
  mockUpdateMany: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('@/src/lib/db', () => ({
  prisma: {
    leaderLock: {
      updateMany: mockUpdateMany,
      create: mockCreate,
    },
  },
}));

const LOCK_NAME = 'test-lock';
const OWNER_A = 'owner-a';
const TTL_MS = 60_000;

function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

describe('acquireLeaderLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockResolvedValue({});
  });

  it('creates the lock and returns true when no record exists', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    expect(result).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: LOCK_NAME, ownerId: OWNER_A }),
      }),
    );
  });

  it('renews/takes over atomically and returns true without creating', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    expect(result).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('scopes the conditional claim to our ownerId or an expired lock', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    const arg = mockUpdateMany.mock.calls[0][0];
    expect(arg.where.name).toBe(LOCK_NAME);
    expect(arg.where.OR).toEqual([
      { ownerId: OWNER_A },
      { expiresAt: { lt: expect.any(Date) } },
    ]);
  });

  it('returns false when the lock is held by a live different owner (create hits P2002)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockRejectedValue(p2002());

    const result = await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    expect(result).toBe(false);
  });

  it('rethrows a non-P2002 create failure', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockRejectedValue(Object.assign(new Error('db down'), { code: 'P1001' }));

    await expect(acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS)).rejects.toThrow('db down');
  });

  it('sets expiresAt to now + ttlMs on create', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const before = Date.now();

    await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    const after = Date.now();
    const expiry: Date = mockCreate.mock.calls[0][0].data.expiresAt;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + TTL_MS);
  });

  it('sets expiresAt to now + ttlMs on renewal', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const before = Date.now();

    await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    const after = Date.now();
    const expiry: Date = mockUpdateMany.mock.calls[0][0].data.expiresAt;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + TTL_MS);
  });
});
