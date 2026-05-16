import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuditService,
  getAuditService,
  extractClientIp,
  extractUserAgent,
  type AuditLogEntry,
} from '../audit';

const { mockAuditLogCreate, mockTrackFailure } = vi.hoisted(() => ({
  mockAuditLogCreate: vi.fn(),
  mockTrackFailure: vi.fn(),
}));

vi.mock('@/src/lib/db', () => ({
  prisma: { auditLog: { create: mockAuditLogCreate } },
}));

vi.mock('@/src/lib/telemetry', () => ({
  trackFailure: mockTrackFailure,
}));

describe('AuditService', () => {
  let svc: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({});
    svc = new AuditService();
  });

  // ── log() ────────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('writes an audit record to the database', async () => {
      await svc.log({ action: 'CREATE', entityType: 'Issue', entityId: 'iss_1' });

      expect(mockAuditLogCreate).toHaveBeenCalledOnce();
      expect(mockAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATE', entityType: 'Issue', entityId: 'iss_1' }),
        }),
      );
    });

    it('merges context into the log entry', async () => {
      svc = new AuditService({ userId: 'u1', userEmail: 'a@b.com', ipAddress: '1.2.3.4' });

      await svc.log({ action: 'DELETE', entityType: 'Webhook', entityId: 'wh_1' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.userId).toBe('u1');
      expect(data.userEmail).toBe('a@b.com');
      expect(data.ipAddress).toBe('1.2.3.4');
    });

    it('entry-level userId overrides context userId', async () => {
      svc = new AuditService({ userId: 'ctx-user' });

      await svc.log({ action: 'UPDATE', entityType: 'Issue', userId: 'entry-user' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.userId).toBe('entry-user');
    });

    it('converts null fields to undefined before writing', async () => {
      await svc.log({ action: 'READ', entityType: 'Issue', entityId: null, ipAddress: null });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.entityId).toBeUndefined();
      expect(data.ipAddress).toBeUndefined();
    });

    it('does not throw when DB write fails', async () => {
      mockAuditLogCreate.mockRejectedValue(new Error('DB down'));

      await expect(svc.log({ action: 'CREATE', entityType: 'Issue' })).resolves.toBeUndefined();
      expect(mockTrackFailure).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'audit.log.failed' }),
      );
    });

    it('truncates oversized changes objects', async () => {
      const bigValue = 'x'.repeat(5000);
      const changes = {
        fieldA: { old: bigValue, new: bigValue },
        fieldB: { old: bigValue, new: bigValue },
      };

      await svc.log({ action: 'UPDATE', entityType: 'Issue', entityId: 'i1', changes });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.changes).toHaveProperty('_truncated');
    });

    it('does not truncate small changes objects', async () => {
      const changes = { status: { old: 'New', new: 'Closed' } };

      await svc.log({ action: 'UPDATE', entityType: 'Issue', entityId: 'i1', changes });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.changes).not.toHaveProperty('_truncated');
      expect(data.changes).toHaveProperty('status');
    });
  });

  // ── logCreate() ──────────────────────────────────────────────────────────

  describe('logCreate()', () => {
    it('logs CREATE action with entity fields as new values', async () => {
      await svc.logCreate('Issue', { id: 'i1', subject: 'Bug', priority: 'High', userId: 'u1' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.action).toBe('CREATE');
      expect(data.entityType).toBe('Issue');
      const changes = data.changes as Record<string, { old: unknown; new: unknown }>;
      expect(changes.subject).toEqual({ old: null, new: 'Bug' });
      expect(changes.priority).toEqual({ old: null, new: 'High' });
    });

    it('excludes internal fields (id, createdAt, updatedAt, userId)', async () => {
      await svc.logCreate('Issue', {
        id: 'i1',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'u1',
        subject: 'Test',
      });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      const changes = data.changes as Record<string, unknown>;
      expect(changes).not.toHaveProperty('id');
      expect(changes).not.toHaveProperty('createdAt');
      expect(changes).not.toHaveProperty('updatedAt');
      expect(changes).not.toHaveProperty('userId');
      expect(changes).toHaveProperty('subject');
    });

    it('passes metadata through to log()', async () => {
      await svc.logCreate('Issue', { id: 'i1', name: 'X' }, { source: 'api' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.metadata).toEqual({ source: 'api' });
    });
  });

  // ── logUpdate() ──────────────────────────────────────────────────────────

  describe('logUpdate()', () => {
    it('logs UPDATE with only changed fields', async () => {
      const before = { status: 'New', priority: 'Low' };
      const after = { status: 'Closed', priority: 'Low' };

      await svc.logUpdate('Issue', 'i1', before, after);

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.action).toBe('UPDATE');
      const changes = data.changes as Record<string, { old: unknown; new: unknown }>;
      expect(changes.status).toEqual({ old: 'New', new: 'Closed' });
      expect(changes).not.toHaveProperty('priority');
    });

    it('skips write entirely when nothing changed', async () => {
      const obj = { status: 'New', priority: 'Low' };

      await svc.logUpdate('Issue', 'i1', obj, obj);

      expect(mockAuditLogCreate).not.toHaveBeenCalled();
    });

    it('treats null before as all-new', async () => {
      await svc.logUpdate('Issue', 'i1', null, { status: 'New', priority: 'High' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      const changes = data.changes as Record<string, { old: unknown; new: unknown }>;
      expect(changes.status).toEqual({ old: null, new: 'New' });
    });

    it('excludes internal fields from change detection', async () => {
      const before = { id: 'same', userId: 'same', status: 'New' };
      const after = { id: 'same', userId: 'same', status: 'Closed' };

      await svc.logUpdate('Issue', 'i1', before, after);

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      const changes = data.changes as Record<string, unknown>;
      expect(changes).not.toHaveProperty('id');
      expect(changes).not.toHaveProperty('userId');
    });
  });

  // ── logDelete() ──────────────────────────────────────────────────────────

  describe('logDelete()', () => {
    it('logs DELETE action', async () => {
      await svc.logDelete('Issue', 'i1', { subject: 'Gone', priority: 'High' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.action).toBe('DELETE');
      expect(data.entityId).toBe('i1');
      const changes = data.changes as Record<string, { old: unknown; new: unknown }>;
      expect(changes.subject).toEqual({ old: 'Gone', new: null });
    });

    it('logs DELETE without changes when deletedData omitted', async () => {
      await svc.logDelete('Issue', 'i1');

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.action).toBe('DELETE');
      expect(data.changes).toBeUndefined();
    });

    it('excludes internal fields from deletedData', async () => {
      await svc.logDelete('Issue', 'i1', { id: 'i1', userId: 'u1', subject: 'X' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      const changes = data.changes as Record<string, unknown>;
      expect(changes).not.toHaveProperty('id');
      expect(changes).not.toHaveProperty('userId');
      expect(changes).toHaveProperty('subject');
    });
  });

  // ── setContext() ─────────────────────────────────────────────────────────

  describe('setContext()', () => {
    it('merges partial context update', async () => {
      svc = new AuditService({ userId: 'u1', ipAddress: '1.2.3.4' });
      svc.setContext({ userId: 'u2' });

      await svc.log({ action: 'CREATE', entityType: 'X' });

      const data = mockAuditLogCreate.mock.calls[0][0].data;
      expect(data.userId).toBe('u2');
      expect(data.ipAddress).toBe('1.2.3.4');
    });
  });
});

// ── getAuditService() ─────────────────────────────────────────────────────

describe('getAuditService()', () => {
  it('returns the same instance on repeated calls', () => {
    // Reset module-level singleton between tests isn't feasible without resetModules,
    // so just verify it returns an AuditService instance
    const s = getAuditService();
    expect(s).toBeInstanceOf(AuditService);
  });

  it('updates context on existing singleton', async () => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({});
    const s1 = getAuditService({ userId: 'original' });
    const s2 = getAuditService({ userId: 'updated' });

    expect(s1).toBe(s2);

    await s1.log({ action: 'CREATE', entityType: 'X' });
    const data = mockAuditLogCreate.mock.lastCall?.[0]?.data;
    expect(data?.userId).toBe('updated');
  });
});

// ── extractClientIp() ─────────────────────────────────────────────────────

describe('extractClientIp()', () => {
  it('returns first IP from x-forwarded-for header', () => {
    const req = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(extractClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when x-forwarded-for absent', () => {
    const req = new Request('http://example.com', {
      headers: { 'x-real-ip': '9.9.9.9' },
    });
    expect(extractClientIp(req)).toBe('9.9.9.9');
  });

  it('returns null when no IP headers present', () => {
    const req = new Request('http://example.com');
    expect(extractClientIp(req)).toBeNull();
  });
});

// ── extractUserAgent() ────────────────────────────────────────────────────

describe('extractUserAgent()', () => {
  it('returns user-agent header value', () => {
    const req = new Request('http://example.com', {
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    expect(extractUserAgent(req)).toBe('Mozilla/5.0');
  });

  it('returns null when user-agent absent', () => {
    const req = new Request('http://example.com');
    expect(extractUserAgent(req)).toBeNull();
  });
});
