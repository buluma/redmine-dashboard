export interface Journal {
  id: string;
  user: string;
  notes: string | null;
  createdOnRemote: string;
}

export interface TimeEntry {
  id: string;
  hours: number;
  activityName: string;
  comments: string | null;
  spentOn: string;
}

export interface Attachment {
  id: string;
  filename: string;
  filesize: number;
  contentType: string;
  contentUrl: string;
  authorName: string;
}

export interface Issue {
  id: string;
  redmineIssueId: number | null;
  redmineBaseUrl: string | null;
  source: 'redmine' | 'local';
  localIssueNumber: number | null;
  subject: string;
  description: string | null;
  statusName: string;
  priority: string | null;
  assignedToName: string | null;
  projectName: string | null;
  tracker: string | null;
  isFavorited: boolean;
  updatedAt: string;
  journals?: Journal[];
  timeEntries?: TimeEntry[];
  attachments?: Attachment[];
}

export interface IssueQueryResponse {
  items: Issue[];
  total: number;
  page: number;
  pageSize: number;
}
