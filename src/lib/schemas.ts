import { z } from "zod";

export const connectSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(8),
});

export const statusUpdateSchema = z.object({
  statusId: z.number().int().positive(),
  note: z.string().trim().max(5000).optional(),
});

export const commentSchema = z.object({
  comment: z.string().trim().min(1).max(10000),
});

export const timeLogSchema = z.object({
  hours: z.number().positive().max(24),
  activityId: z.number().int().positive(),
  comment: z.string().trim().max(255).optional(),
  spentOn: z.string().date().optional(),
});

export const issueQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  project: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(["updated_desc", "updated_asc", "priority", "due_date"]).default("updated_desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
