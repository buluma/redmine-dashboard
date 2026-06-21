import type { AllowedStatusView } from "@/src/lib/issue-shape";

export type { AllowedStatusView };

export type User = {
  id: string;
  username: string;
  displayName: string;
};

export type JournalDetail = {
  property: string;
  name: string;
  old_value: string;
  new_value: string;
};

export type Journal = {
  id: string;
  author: string | null;
  notes: string | null;
  details: JournalDetail[];
  createdOnRemote: string;
};

export type TimeEntry = {
  id: string;
  redmineTimeEntryId: number | null;
  hours: number;
  activityId: number;
  activityName: string | null;
  authorName: string | null;
  comments: string | null;
  spentOn: string;
};

export type GithubLink = {
  id: string;
  repositoryFullName: string;
  githubIssueNumber: number | null;
  githubPrNumber: number | null;
  url: string;
  title: string | null;
  createdAt: string;
};

export type Attachment = {
  id: string;
  redmineAttachmentId: number;
  filename: string;
  filesize: number;
  contentType: string | null;
  author: string | null;
  createdOnRemote: string | null;
};

export type Relation = {
  id: string;
  redmineRelationId: number;
  targetIssueId: number;
  relationType: string;
  delay: number | null;
};

export type IssueChild = {
  id: number;
  subject: string;
};

export type Issue = {
  id: string;
  redmineIssueId: number;
  localIssueNumber?: number | null;
  redmineBaseUrl: string;
  subject: string;
  description: string | null;
  projectName: string | null;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  tracker: string | null;
  priority: string | null;
  priorityId: number | null;
  priorityName: string | null;
  statusId: number;
  statusName: string;
  assignedToName: string | null;
  updatedAt: string;
  updatedOnRemote: string;
  lastActivityAt: string | null;
  lastActivityType: string | null;
  dueDate: string | null;
  startDate: string | null;
  estimatedHours: number | null;
  createdAt: string;
  doneRatio: number | null;
  githubLinks: GithubLink[];
  journals: Journal[];
  timeEntries: TimeEntry[];
  attachments: Attachment[];
  relations: Relation[];
  allowedStatuses: AllowedStatusView[];
  children: IssueChild[];
};

export type StatusCatalog = { id: number; name: string; isClosed: boolean };

export type SyncState = {
  lastSyncStatus: string;
  lastIncrementalSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  runningJobId: string | null;
} | null;

export type BootstrapInfo = {
  configured: boolean;
  canBootstrap: boolean;
  activeCredentials: number;
} | null;

export type FilterPreset = {
  id: string;
  name: string;
  statusFilter: string;
  priorityFilter: string;
  search: string;
  showFavoritesOnly: boolean;
  assignedToMe?: boolean;
};

export type SavedView = {
  id: string;
  name: string;
  statusFilter: string;
  priorityFilter: string;
  search: string;
  sort: string;
  position?: number;
  assignedToMe: boolean;
};

export type ActivityEvent = {
  issueId: string;
  issueLabel: string;
  issueSubject: string;
  timestamp: string;
  detail: string;
};
