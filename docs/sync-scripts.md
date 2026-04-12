# Sync and Maintenance Scripts

This document describes the operational scripts in `scripts/` for syncing and maintaining data between Redmine and the Supabase database.

## Issue Sync

### `scripts/sync-all-issues.js`

Full paginated sync of ALL Redmine issues to Supabase.

```bash
# Sync all issues (fetches and upserts ~109K issues)
node scripts/sync-all-issues.js

# Dry run (estimates time, fetches 2 pages)
node scripts/sync-all-issues.js --dry-run

# Resume from a specific offset (e.g., after interruption)
node scripts/sync-all-issues.js --from-offset 50000
```

**How it works:**
- Fetches pages in batches of 50 (5,000 issues per batch)
- Upserts 25 issues at a time in parallel
- Tracks `parentIssueId` for parent-child relationships
- Stores `childrenJson` with full nested child data
- Rate-limit aware with retry logic

**Issue fields synced:**
| Field | Redmine Source |
|---|---|
| `subject`, `description`, `tracker`, `priority` | issue detail |
| `statusId`, `statusName` | issue status |
| `parentIssueId`, `parentIssueLabel` | issue parent |
| `assignedToId`, `assignedToName`, `authorId`, `authorName` | user references |
| `categoryId`, `categoryName` | issue category |
| `startDate`, `dueDate`, `estimatedHours`, `spentHours` | dates and time |
| `customFieldsJson` | custom fields array |
| `childrenJson` | nested children array |
| `doneRatio` | progress percentage |

### `scripts/sync-children-quick.js`

Quick sync that updates `childrenJson` and upserts direct children for specific parent issues.

```bash
node scripts/sync-children-quick.js 101201 102084 97459
```

### `scripts/sync-issue-children.js`

Full recursive sync that flattens nested children and syncs each as individual issues with `parentIssueId` set.

```bash
node scripts/sync-issue-children.js 101201
```

## User Sync

### `scripts/sync-redmine-users.js`

Extracts unique users from Redmine issues (author, assigned_to) and stores them in the `RedmineUser` table.

```bash
node scripts/sync-redmine-users.js
```

**Usage:** The synced users are used for issue assignment in the Quick Actions panel.

## Enumeration Sync

### `scripts/sync-enumerations.js`

Fetches Redmine enumerations (issue priorities, time entry activities, document categories) and stores them in `RedmineEnumeration`.

```bash
node scripts/sync-enumerations.js
```

## Utility Scripts

### `scripts/check-issues.js`

Quick check of issue count and latest issue in Supabase.

```bash
node scripts/check-issues.js
# Output:
# Issues in Supabase: 47,484
# Latest: #113112 - Week 20: Support for Vodacom SL Users (MBU) (...)
```

### `scripts/check-children.js`

Inspect children data for a specific issue.

```bash
node scripts/check-children.js 101201
```

### `scripts/check-enums.js`

Check enumeration data (priorities, activities).

```bash
node scripts/check-enums.js
```

### `scripts/test-time-entries.js`

Compare time entries between Redmine API and local database.

```bash
node scripts/test-time-entries.js
```

### `scripts/trigger-sync.js`

Trigger a manual sync via the web API (requires session cookie).

```bash
node scripts/trigger-sync.js 'session_cookie_here'
```

## Environment Variables

All scripts require these in `.env`:

```
REDMINE_BASE_URL="https://redmine.nasctech.com"
REDMINE_API_KEY="your-api-key"
DATABASE_URL="postgresql://..."   # Supabase connection
```

## Database Schema Reference

### Key Relationships

```
Issue.parentIssueId → Issue.redmineIssueId  (self-referential)
Issue.userId → User.id
IssueRelation.issueId → Issue.id
IssueAttachment.issueId → Issue.id
TimeEntry.issueId → Issue.id
RedmineUser.id (Redmine user ID, not a FK)
RedmineEnumeration.id (Redmine enumeration ID)
```

### Indexes

| Table | Index | Purpose |
|---|---|---|
| `Issue` | `[userId, redmineBaseUrl, redmineIssueId]` | Unique constraint |
| `Issue` | `[userId, statusId]` | Status filtering |
| `Issue` | `[userId, updatedOnRemote]` | Sorting by update time |
| `Issue` | `[parentIssueId]` | Parent-child queries |
| `RedmineUser` | `[name]` | User search |
| `RedmineEnumeration` | `[kind, isActive]` | Active enumerations |
| `RedmineEnumeration` | `[kind, position]` | Ordered enumerations |
