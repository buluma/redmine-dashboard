/**
 * Recurring Ticket Series admin service — CRUD over RecurringTicketSeries,
 * plus read access to its RecurringTicketInstance history, for the
 * /ops/recurring-tickets admin page and its API routes. The actual
 * create/close automation lives in src/lib/recurring-tickets.ts; this module
 * only manages the series configuration those functions read.
 */

import { Prisma } from "@prisma/client";
import type { RecurringTicketSeries } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { getAuditService } from "@/src/lib/audit";

export type SeriesInput = {
  key: string;
  name: string;
  isActive?: boolean;
  redmineProjectId: number;
  parentIssueId: number;
  trackerId: number;
  priorityId: number;
  categoryId?: number | null;
  assignedToId?: number | null;
  subjectTemplate: string;
  descriptionTemplate?: string | null;
  estimatedHours?: number | null;
  customFieldsJson?: Array<{ id: number; value: string }> | null;
  cadence: "weekly" | "monthly";
  createWeekday: number;
  closeWeekday: number;
  createDayOfMonth: number;
  closeDayOfMonth?: number | null;
  wakatimeProjectName: string;
  defaultActivityId: number;
  defaultActivityName: string;
  expectsTime: boolean;
};

export type SeriesUpdateInput = Partial<Omit<SeriesInput, "key">>;

export async function listSeries(userId: string): Promise<Array<RecurringTicketSeries & { instanceCount: number }>> {
  const series = await prisma.recurringTicketSeries.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { instances: true } } },
  });
  return series.map(({ _count, ...s }) => ({ ...s, instanceCount: _count.instances }));
}

export async function getSeries(id: string, userId: string): Promise<RecurringTicketSeries | null> {
  return prisma.recurringTicketSeries.findFirst({ where: { id, userId } });
}

export async function createSeries(userId: string, input: SeriesInput): Promise<RecurringTicketSeries> {
  const series = await prisma.recurringTicketSeries.create({
    data: {
      userId,
      key: input.key,
      name: input.name,
      isActive: input.isActive ?? true,
      redmineProjectId: input.redmineProjectId,
      parentIssueId: input.parentIssueId,
      trackerId: input.trackerId,
      priorityId: input.priorityId,
      categoryId: input.categoryId ?? null,
      assignedToId: input.assignedToId ?? null,
      subjectTemplate: input.subjectTemplate,
      descriptionTemplate: input.descriptionTemplate ?? null,
      estimatedHours: input.estimatedHours ?? null,
      customFieldsJson: (input.customFieldsJson ?? undefined) as Prisma.InputJsonValue | undefined,
      cadence: input.cadence,
      createWeekday: input.createWeekday,
      closeWeekday: input.closeWeekday,
      createDayOfMonth: input.createDayOfMonth,
      closeDayOfMonth: input.closeDayOfMonth ?? null,
      wakatimeProjectName: input.wakatimeProjectName,
      defaultActivityId: input.defaultActivityId,
      defaultActivityName: input.defaultActivityName,
      expectsTime: input.expectsTime,
    },
  });

  await getAuditService().log({
    action: "CREATE",
    entityType: "RecurringTicketSeries",
    entityId: series.id,
    metadata: { key: series.key, name: series.name },
  });

  return series;
}

export async function updateSeries(
  id: string,
  userId: string,
  input: SeriesUpdateInput,
): Promise<RecurringTicketSeries> {
  const data: Prisma.RecurringTicketSeriesUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.redmineProjectId !== undefined) data.redmineProjectId = input.redmineProjectId;
  if (input.parentIssueId !== undefined) data.parentIssueId = input.parentIssueId;
  if (input.trackerId !== undefined) data.trackerId = input.trackerId;
  if (input.priorityId !== undefined) data.priorityId = input.priorityId;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId;
  if (input.subjectTemplate !== undefined) data.subjectTemplate = input.subjectTemplate;
  if (input.descriptionTemplate !== undefined) data.descriptionTemplate = input.descriptionTemplate;
  if (input.estimatedHours !== undefined) data.estimatedHours = input.estimatedHours;
  if (input.customFieldsJson !== undefined) {
    data.customFieldsJson = (input.customFieldsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue;
  }
  if (input.cadence !== undefined) data.cadence = input.cadence;
  if (input.createWeekday !== undefined) data.createWeekday = input.createWeekday;
  if (input.closeWeekday !== undefined) data.closeWeekday = input.closeWeekday;
  if (input.createDayOfMonth !== undefined) data.createDayOfMonth = input.createDayOfMonth;
  if (input.closeDayOfMonth !== undefined) data.closeDayOfMonth = input.closeDayOfMonth;
  if (input.wakatimeProjectName !== undefined) data.wakatimeProjectName = input.wakatimeProjectName;
  if (input.defaultActivityId !== undefined) data.defaultActivityId = input.defaultActivityId;
  if (input.defaultActivityName !== undefined) data.defaultActivityName = input.defaultActivityName;
  if (input.expectsTime !== undefined) data.expectsTime = input.expectsTime;

  const updated = await prisma.recurringTicketSeries.update({
    where: { id, userId },
    data,
  });

  await getAuditService().log({
    action: "UPDATE",
    entityType: "RecurringTicketSeries",
    entityId: id,
    metadata: { updatedFields: Object.keys(input) },
  });

  return updated;
}

export async function toggleSeries(id: string, userId: string, isActive: boolean): Promise<void> {
  await prisma.recurringTicketSeries.update({
    where: { id, userId },
    data: { isActive },
  });

  await getAuditService().log({
    action: "UPDATE",
    entityType: "RecurringTicketSeries",
    entityId: id,
    metadata: { isActive },
  });
}

export type InstanceHistoryRow = {
  id: string;
  seriesKey: string;
  seriesName: string;
  periodKey: string;
  subject: string;
  issueId: string | null;
  redmineIssueId: number;
  status: string;
  closeAttempts: number;
  lastError: string | null;
  finalHoursApplied: number | null;
  scheduledCreateDate: Date;
  scheduledCloseDate: Date;
  closedAt: Date | null;
  createdAt: Date;
};

export async function listRecentInstances(userId: string, limit = 50): Promise<InstanceHistoryRow[]> {
  const instances = await prisma.recurringTicketInstance.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { series: { select: { key: true, name: true } } },
  });

  return instances.map((instance) => ({
    id: instance.id,
    seriesKey: instance.series.key,
    seriesName: instance.series.name,
    periodKey: instance.periodKey,
    subject: instance.subject,
    issueId: instance.issueId,
    redmineIssueId: instance.redmineIssueId,
    status: instance.status,
    closeAttempts: instance.closeAttempts,
    lastError: instance.lastError,
    finalHoursApplied: instance.finalHoursApplied,
    scheduledCreateDate: instance.scheduledCreateDate,
    scheduledCloseDate: instance.scheduledCloseDate,
    closedAt: instance.closedAt,
    createdAt: instance.createdAt,
  }));
}
