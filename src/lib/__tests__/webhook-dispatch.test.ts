import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchWebhook, processWebhookDeliveries } from '../webhook-subscription';
import type { WebhookPayload } from '../webhook-subscription';

const { mockPrisma, mockSendWebhookRequest } = vi.hoisted(() => ({
  mockSendWebhookRequest: vi.fn(),
  mockPrisma: {
    webhookSubscription: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    webhookDelivery: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/src/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('../webhook-url', () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue({ valid: true }),
  sendWebhookRequest: mockSendWebhookRequest,
}));

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

const subscription = {
  id: 'sub-1',
  name: 'Test',
  url: 'https://example.com/hook',
  events: ['ticket.created'],
  active: true,
  secret: 'secret',
  failureCount: 0,
};

describe('Webhook delivery queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWebhookRequest.mockResolvedValue({ status: 200, responseBody: 'ok' });
    mockPrisma.webhookDelivery.create.mockResolvedValue({});
    mockPrisma.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.webhookDelivery.update.mockResolvedValue({});
    mockPrisma.webhookSubscription.update.mockResolvedValue({});
  });

  it('queues matching events without making a network request inline', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([subscription]);
    await dispatchWebhook('ticket.created', mockPayload.ticket);

    expect(mockSendWebhookRequest).not.toHaveBeenCalled();
    expect(mockPrisma.webhookDelivery.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        event: 'ticket.created',
        status: 'pending',
        attempt: 0,
      }),
    }));
  });

  it('does not create a delivery when no active subscription wants the event', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([]);
    await dispatchWebhook('ticket.created', mockPayload.ticket);
    expect(mockPrisma.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it('schedules a persisted retry for a transient server error', async () => {
    mockPrisma.webhookDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      subscriptionId: subscription.id,
      event: 'ticket.created',
      payload: mockPayload,
      attempt: 0,
    }]);
    mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscription);
    mockSendWebhookRequest.mockResolvedValueOnce({ status: 503, responseBody: 'unavailable' });

    await processWebhookDeliveries();

    expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({ status: 'pending', attempt: 1, error: expect.stringContaining('503') }),
    }));
    expect(mockPrisma.webhookSubscription.update).not.toHaveBeenCalled();
  });

  it('skips a delivery claimed by another worker instance', async () => {
    mockPrisma.webhookDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      subscriptionId: subscription.id,
      event: 'ticket.created',
      payload: mockPayload,
      attempt: 0,
    }]);
    mockPrisma.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });
    await processWebhookDeliveries();

    expect(mockSendWebhookRequest).not.toHaveBeenCalled();
    expect(mockPrisma.webhookDelivery.update).not.toHaveBeenCalled();
  });

  it('marks successful delivery complete and resets the subscription failure count', async () => {
    mockPrisma.webhookDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      subscriptionId: subscription.id,
      event: 'ticket.created',
      payload: mockPayload,
      attempt: 1,
    }]);
    mockPrisma.webhookSubscription.findUnique.mockResolvedValue({ ...subscription, failureCount: 2 });
    await processWebhookDeliveries();

    expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'complete', attempt: 2, responseStatus: 200 }),
    }));
    expect(mockPrisma.webhookSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ failureCount: 0 }),
    }));
  });

  it('marks the last failed attempt and disables subscriptions at the failure threshold', async () => {
    mockPrisma.webhookDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      subscriptionId: subscription.id,
      event: 'ticket.created',
      payload: mockPayload,
      attempt: 2,
    }]);
    mockPrisma.webhookSubscription.findUnique.mockResolvedValue({ ...subscription, failureCount: 4 });
    mockSendWebhookRequest.mockResolvedValueOnce({ status: 503, responseBody: 'unavailable' });

    await processWebhookDeliveries();

    expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', attempt: 3 }),
    }));
    expect(mockPrisma.webhookSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { active: false },
    }));
  });

  it('counts each claim as an attempt and stamps it with the claim time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const start = new Date('2026-10-07T10:00:00.000Z');
      const later = new Date(start.getTime() + 90_000);
      vi.setSystemTime(start);
      mockPrisma.webhookDelivery.findMany.mockResolvedValue([
        { id: 'delivery-1', subscriptionId: subscription.id, event: 'ticket.created', payload: mockPayload, attempt: 0 },
        { id: 'delivery-2', subscriptionId: subscription.id, event: 'ticket.created', payload: mockPayload, attempt: 0 },
      ]);
      mockPrisma.webhookSubscription.findUnique.mockResolvedValue(subscription);
      mockSendWebhookRequest.mockImplementation(async () => {
        // A slow receiver must not make later claims in the batch look stale.
        vi.setSystemTime(later);
        return { status: 200, responseBody: 'ok' };
      });

      await processWebhookDeliveries();

      const claims = mockPrisma.webhookDelivery.updateMany.mock.calls.map(([args]) => args);
      expect(claims[0].data).toEqual({ status: 'processing', claimedAt: start, attempt: { increment: 1 } });
      expect(claims[1].data).toEqual({ status: 'processing', claimedAt: later, attempt: { increment: 1 } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails a reclaimed delivery whose attempts are exhausted without sending it again', async () => {
    mockPrisma.webhookDelivery.findMany.mockResolvedValue([{
      id: 'delivery-1',
      subscriptionId: subscription.id,
      event: 'ticket.created',
      payload: mockPayload,
      attempt: 3,
    }]);
    await processWebhookDeliveries();

    expect(mockSendWebhookRequest).not.toHaveBeenCalled();
    expect(mockPrisma.webhookDelivery.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({ status: 'failed', claimedAt: null }),
    }));
  });

  it('skips a poll while the previous one in this process is still running', async () => {
    let releaseFirstPoll: (value: unknown[]) => void = () => {};
    mockPrisma.webhookDelivery.findMany.mockReturnValueOnce(new Promise((resolve) => { releaseFirstPoll = resolve; }));

    const first = processWebhookDeliveries();
    await expect(processWebhookDeliveries()).resolves.toBe(0);
    releaseFirstPoll([]);
    await first;

    expect(mockPrisma.webhookDelivery.findMany).toHaveBeenCalledTimes(1);
  });
});
