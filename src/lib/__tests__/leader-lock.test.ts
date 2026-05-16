import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acquireLeaderLock } from '../leader-lock';

const { mockFindUnique, mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/src/lib/db', () => ({
  prisma: {
    leaderLock: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

const LOCK_NAME = 'test-lock';
const OWNER_A = 'owner-a';
const OWNER_B = 'owner-b';
const TTL_MS = 60_000;

function makeRecord(overrides: Partial<{ ownerId: string; expiresAt: Date }> = {}) {
  return {
    name: LOCK_NAME,
    ownerId: OWNER_A,
    heartbeatAt: new Date(),
    expiresAt: new Date(Date.now() + TTL_MS),
    ...overrides,
  };
}

describe('acquireLeaderLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockUpdate.mockResolvedValue({});
  });

  it('creates lock and returns true when no record exists', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    expect(result).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: LOCK_NAME, ownerId: OWNER_A }),
      }),
    );
  });

  it('renews lock and returns true when caller is current owner', async () => {
    mockFindUnique.mockResolvedValue(makeRecord({ ownerId: OWNER_A }));

    const result = await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: OWNER_A }),
      }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('takes over expired lock and returns true', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecord({ ownerId: OWNER_B, expiresAt: new Date(Date.now() - 1000) }),
    );

    const result = await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    expect(result).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: OWNER_A }),
      }),
    );
  });

  it('returns false when lock is held by another owner and not expired', async () => {
    mockFindUnique.mockResolvedValue(
      makeRecord({ ownerId: OWNER_B, expiresAt: new Date(Date.now() + TTL_MS) }),
    );

    const result = await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    expect(result).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('sets expiresAt to now + ttlMs on create', async () => {
    mockFindUnique.mockResolvedValue(null);
    const before = Date.now();

    await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    const after = Date.now();
    const created = mockCreate.mock.calls[0][0].data;
    const expiry: Date = created.expiresAt;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + TTL_MS);
  });

  it('sets expiresAt to now + ttlMs on renewal', async () => {
    mockFindUnique.mockResolvedValue(makeRecord({ ownerId: OWNER_A }));
    const before = Date.now();

    await acquireLeaderLock(LOCK_NAME, OWNER_A, TTL_MS);

    const after = Date.now();
    const updated = mockUpdate.mock.calls[0][0].data;
    const expiry: Date = updated.expiresAt;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + TTL_MS);
  });

  it('queries by correct lock name', async () => {
    mockFindUnique.mockResolvedValue(null);

    await acquireLeaderLock('specific-lock', OWNER_A, TTL_MS);

    expect(mockFindUnique).toHaveBeenCalledWith({ where: { name: 'specific-lock' } });
  });
});
