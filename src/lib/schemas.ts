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
  project: z.string().optional(),
  search: z.string().optional(),
  searchMode: z.enum(["local", "remote", "hybrid"]).default("local"),
  scope: z.enum(["issues", "all"]).default("issues"),
  source: z.enum(["all", "redmine", "local"]).default("all"),
  openOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => (typeof value === "string" ? value === "true" : value)),
  favoritedOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .default(false)
    .transform((value) => (typeof value === "string" ? value === "true" : value ?? false)),
  sort: z.enum(["updated_desc", "updated_asc", "priority", "due_date"]).default("updated_desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
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

export const relationCreateSchema = z.object({
  issueToId: z.number().int().positive(),
  relationType: z.enum([
    "relates",
    "duplicates",
    "duplicated",
    "blocks",
    "blocked",
    "precedes",
    "follows",
    "copied_to",
    "copied_from",
  ]),
  delay: z.number().int().min(0).max(3650).optional(),
});

export const issueAttachmentCreateSchema = z.object({
  description: z.string().trim().max(255).optional(),
});

export const timeEntryQuerySchema = z.object({
  issueId: z.coerce.number().int().positive().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  user: z.enum(["me"]).default("me"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

export const timeEntryUpdateSchema = z.object({
  hours: z.number().positive().max(24).optional(),
  activityId: z.number().int().positive().optional(),
  comment: z.string().trim().max(255).optional(),
  spentOn: z.string().date().optional(),
}).refine((v) => v.hours !== undefined || v.activityId !== undefined || v.comment !== undefined || v.spentOn !== undefined, {
  message: "At least one field must be provided",
});
