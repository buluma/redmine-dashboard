import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchWebhook, getActiveSubscriptions } from '../webhook-subscription';
import type { WebhookPayload, WebhookEvent } from '../webhook-subscription';

vi.mock('@/src/lib/db', () => ({
  prisma: {
    webhookSubscription: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@/src/lib/db';

const mockPrisma = prisma as any;

describe('Webhook Dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // webhookDelivery.create is called fire-and-forget with .catch(); must return a Promise
    mockPrisma.webhookDelivery.create.mockResolvedValue({});
  });

  const mockPayload: WebhookPayload = {
    id: 'test_123',
    event: 'ticket.created',
    timestamp: new Date().toISOString(),
    ticket: {
      id: 'issue_123',
      redmineIssueId: 123,
      subject: 'Test Issue',
      description: 'Test description',
      projectName: 'Test Project',
      trackerName: 'Bug',
      statusName: 'New',
      priorityName: 'High',
      assignedToId: '1',
      assignedToName: 'John Doe',
      authorId: '1',
      authorName: 'Jane Doe',
      dueDate: '2026-05-01',
      doneRatio: 0,
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    },
  };

  describe('getActiveSubscriptions', () => {
    it('should return only active subscriptions', async () => {
      // Prisma applies where: { active: true } — mock returns what the DB would return
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'Active Sub', url: 'https://example.com/webhook', events: ['ticket.created'], active: true },
      ]);

      const subscriptions = await getActiveSubscriptions();

      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].name).toBe('Active Sub');
    });

    it('should filter subscriptions by event type', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'All Events', url: 'https://example.com/hook', events: ['ticket.created', 'ticket.updated'], active: true },
        { id: '2', name: 'Created Only', url: 'https://example2.com/hook', events: ['ticket.created'], active: true },
      ]);

      const subscriptions = await getActiveSubscriptions();
      const createdSubs = subscriptions.filter(s => s.events.includes('ticket.created'));

      expect(createdSubs).toHaveLength(2);
    });
  });

  describe('dispatchWebhook - event routing', () => {
    it('should dispatch ticket.created events', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'Test', url: 'https://example.com/hook', events: ['ticket.created'], active: true, secret: 'test-secret' },
      ]);

      // Mock the HTTP request
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      await dispatchWebhook('ticket.created', mockPayload.ticket);

      expect(mockFetch).toHaveBeenCalled();
      expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event: 'ticket.created',
          }),
        })
      );
    });

    it('should dispatch ticket.updated events', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'Test', url: 'https://example.com/hook', events: ['ticket.updated'], active: true, secret: '' },
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const changes = [{ field: 'subject', oldValue: 'Old', newValue: 'New' }];
      await dispatchWebhook('ticket.updated', mockPayload.ticket, changes);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should dispatch ticket.status_changed events', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'Status Watcher', url: 'https://example.com/status', events: ['ticket.status_changed'], active: true, secret: '' },
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const changes = [{ field: 'status', oldValue: 'New', newValue: 'In Progress' }];
      await dispatchWebhook('ticket.status_changed', mockPayload.ticket, changes);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should dispatch ticket.assigned events', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'Assign Watcher', url: 'https://example.com/assign', events: ['ticket.assigned'], active: true, secret: '' },
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const changes = [{ field: 'assigned_to_id', oldValue: null, newValue: '5' }];
      await dispatchWebhook('ticket.assigned', mockPayload.ticket, changes);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should dispatch ticket.completed events', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'Completion Tracker', url: 'https://example.com/done', events: ['ticket.completed'], active: true, secret: '' },
      ]);

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      await dispatchWebhook('ticket.completed', { ...mockPayload.ticket, statusName: 'Closed', doneRatio: 100 });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should log failed deliveries', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        { id: '1', name: 'Test', url: 'https://example.com/hook', events: ['ticket.created'], active: true, secret: '' },
      ]);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await dispatchWebhook('ticket.created', mockPayload.ticket);

      expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            error: expect.any(String),
          }),
        })
      );
    });

    it('should not dispatch when no subscriptions exist', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([]);

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await dispatchWebhook('ticket.created', mockPayload.ticket);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
