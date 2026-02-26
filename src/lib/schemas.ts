import { z } from "zod";

export const connectSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(8),
});

export const mobilePairConnectSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(8),
  deviceName: z.string().trim().min(1).max(120).optional(),
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

export const bulkStatusUpdateSchema = z.object({
  issueIds: z.array(z.number().int().positive()).min(1).max(50),
  statusId: z.number().int().positive(),
  note: z.string().trim().max(5000).optional(),
});

export const issueQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(["updated_desc", "updated_asc", "priority", "due_date"]).default("updated_desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const githubLinkCreateSchema = z
  .object({
    repositoryFullName: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Repository must look like owner/repo"),
    githubIssueNumber: z.number().int().positive().optional(),
    githubPrNumber: z.number().int().positive().optional(),
    url: z.string().trim().url().optional(),
    title: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) => !(value.githubIssueNumber && value.githubPrNumber),
    "Provide either githubIssueNumber or githubPrNumber, not both",
  );

export const githubLinkDeleteSchema = z.object({
  linkId: z.string().trim().min(1),
});
