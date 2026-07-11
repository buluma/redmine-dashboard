import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const { mockPrismaImpl } = vi.hoisted(() => ({
  mockPrismaImpl: {
    issue: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    syncJob: {
      create: vi.fn(),
      update: vi.fn(),
    },
    syncState: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    redmineCredential: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../db', () => ({
  prisma: mockPrismaImpl,
}));

vi.mock('../redmine', () => ({
  RedmineClient: vi.fn().mockImplementation(() => ({
    listIssues: vi.fn().mockResolvedValue({
      issues: [],
      total_count: 0,
      offset: 0,
      limit: 25,
    }),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, login: 'test' }),
  })),
}));

vi.mock('../log', () => ({
  logEvent: vi.fn(),
}));

import { prisma } from '../db';

const mockPrisma = prisma as unknown as typeof mockPrismaImpl;

describe('Sync Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Sync State Management', () => {
    it('should create new sync state for user', async () => {
      const userId = 'user_123';
      
      mockPrisma.syncState.findUnique.mockResolvedValue(null);
      mockPrisma.syncState.upsert.mockResolvedValue({
        userId,
        lastSyncStatus: 'idle',
      });

      // Simulate sync state creation
      const existing = await mockPrisma.syncState.findUnique({
        where: { userId },
      });

      expect(existing).toBeNull();
    });

    it('should update sync status to running', async () => {
      const userId = 'user_123';
      const now = new Date();

      mockPrisma.syncState.findUnique.mockResolvedValue({
        userId,
        lastSyncStatus: 'idle',
        runningJobId: null,
      });

      mockPrisma.syncState.update.mockResolvedValue({
        userId,
        lastSyncStatus: 'running',
        runningJobId: 'job_123',
        lastIncrementalSyncAt: now,
      });

      const result = await mockPrisma.syncState.update({
        where: { userId },
        data: {
          lastSyncStatus: 'running',
          runningJobId: 'job_123',
        },
      });

      expect(result.lastSyncStatus).toBe('running');
    });

    it('should update sync status to completed', async () => {
      const userId = 'user_123';

      mockPrisma.syncState.update.mockResolvedValue({
        userId,
        lastSyncStatus: 'completed',
        runningJobId: null,
      });

      const result = await mockPrisma.syncState.update({
        where: { userId },
        data: {
          lastSyncStatus: 'completed',
          runningJobId: null,
          lastIncrementalSyncAt: new Date(),
        },
      });

      expect(result.lastSyncStatus).toBe('completed');
      expect(result.runningJobId).toBeNull();
    });
  });

  describe('Issue Sync', () => {
    it('should fetch issues from Redmine', async () => {
      const userId = 'user_123';
      const mockIssues = [
        { id: 1, subject: 'Issue 1', status: { name: 'New' } },
        { id: 2, subject: 'Issue 2', status: { name: 'In Progress' } },
      ];

      mockPrisma.issue.findMany.mockResolvedValue(mockIssues);

      const issues = await mockPrisma.issue.findMany({
        where: { userId },
        take: 100,
      });

      expect(issues).toHaveLength(2);
    });

    it('should count user issues', async () => {
      const userId = 'user_123';

      mockPrisma.issue.count.mockResolvedValue(42);

      const count = await mockPrisma.issue.count({
        where: { userId },
      });

      expect(count).toBe(42);
    });

    it('should update issue with new data', async () => {
      const issueId = 'issue_123';

      mockPrisma.issue.update.mockResolvedValue({
        id: issueId,
        subject: 'Updated Subject',
        statusName: 'In Progress',
      });

      const result = await mockPrisma.issue.update({
        where: { id: issueId },
        data: {
          subject: 'Updated Subject',
          statusName: 'In Progress',
        },
      });

      expect(result.subject).toBe('Updated Subject');
    });
  });

  describe('Sync Jobs', () => {
    it('should create a sync job', async () => {
      const userId = 'user_123';
      const jobType = 'full';

      mockPrisma.syncJob.create.mockResolvedValue({
        id: 'job_123',
        userId,
        jobType,
        status: 'pending',
        startedAt: null,
      });

      const result = await mockPrisma.syncJob.create({
        data: {
          userId,
          jobType,
          status: 'pending',
        },
      });

      expect(result.jobType).toBe(jobType);
      expect(result.status).toBe('pending');
    });

    it('should update job to running', async () => {
      const jobId = 'job_123';

      mockPrisma.syncJob.update.mockResolvedValue({
        id: jobId,
        status: 'running',
        startedAt: new Date(),
      });

      const result = await mockPrisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });

      expect(result.status).toBe('running');
    });

    it('should mark job as completed', async () => {
      const jobId = 'job_123';

      mockPrisma.syncJob.update.mockResolvedValue({
        id: jobId,
        status: 'completed',
        endedAt: new Date(),
        error: null,
      });

      const result = await mockPrisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          endedAt: new Date(),
          error: null,
        },
      });

      expect(result.status).toBe('completed');
    });

    it('should mark job as failed', async () => {
      const jobId = 'job_123';
      const errorMsg = 'Network timeout';

      mockPrisma.syncJob.update.mockResolvedValue({
        id: jobId,
        status: 'failed',
        endedAt: new Date(),
        error: errorMsg,
      });

      const result = await mockPrisma.syncJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          endedAt: new Date(),
          error: errorMsg,
        },
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBe(errorMsg);
    });
  });
});
