# Sync and Maintenance Scripts

This document describes the operational scripts in `scripts/` for syncing and maintaining data between Redmine and the Supabase database.

## Quick Reference

| Script | Purpose | Example |
|---|---|---|
| `sync-all-issues.js` | Full sync of all Redmine issues (100K+ capable) | `node scripts/sync-all-issues.js` |
| `sync-assigned.js` | Issues assigned to or authored by you | `node scripts/sync-assigned.js` |
| `sync-children.js` | Children of a parent issue | `node scripts/sync-children.js 97459` |
| `sync-query.js` | Issues from a saved Redmine query | `node scripts/sync-query.js 747` |
| `sync-query-details.js` | Children + time entries for query issues | `node scripts/sync-query-details.js 754 747` |
| `sync-time-entries.js` | Compare time entries Redmine vs local | `node scripts/sync-time-entries.js 113112` |
| `sync-users.js` | Redmine users catalog | `node scripts/sync-users.js` |
| `sync-enums.js` | Priorities and activities | `node scripts/sync-enums.js` |
| `db-status.js` | Check DB state | `node scripts/db-status.js` |
| `trigger-sync.js` | Trigger web sync via API | `node scripts/trigger-sync.js 'cookie'` |
| `check-sync-jobs.js` | Sync job history | `node scripts/check-sync-jobs.js` |

## Issue Sync

### `scripts/sync-all-issues.js`

Performs a full paginated sync of **all** Redmine issues (`status_id=*`) directly to the database, outside the web app sync-job queue.
Use this for large datasets (e.g. ~109K tickets) when `sync/manual-pull` is too heavy for in-process jobs.

```bash
# Full all-issues sync
node scripts/sync-all-issues.js

# Resume automatically from checkpoint (default behavior)
node scripts/sync-all-issues.js

# Dry-run a subset (10 pages x 100 issues/page by default)
node scripts/sync-all-issues.js --max-pages=10

# Explicit start offset without checkpoint usage
node scripts/sync-all-issues.js --from-offset=5000 --no-resume
```

**Key properties:**
- Ignores `REDMINE_SYNC_ISSUE_SCOPE` runtime behavior; always syncs `status_id=*`.
- Uses resumable checkpoints in `/tmp/redmine-sync-all-progress.json` by default.
- Upsert-only behavior (no destructive issue deletes).
- Supports interruption-safe runs (`Ctrl+C` saves progress and exits cleanly).

### `scripts/sync-assigned.js`

Syncs only issues **assigned to** or **authored by** the authenticated user. Much faster than full sync — typically a few hundred issues vs 100K+.

```bash
# Sync assigned + authored issues
node scripts/sync-assigned.js
```

**How it works:**
- Fetches `assigned_to_id=me` and `author_id=me` separately
- Merges and deduplicates by issue ID
- Upserts all issues in parallel batches of 50
- Supabase acts as source of truth — syncs are strictly additive (upsert only)

### `scripts/sync-children.js`

Syncs all child issues for a specific parent issue.

```bash
node scripts/sync-children.js <parent_issue_id>

# Example
node scripts/sync-children.js 97459
```

**How it works:**
- Uses `parent_id=<parentId>` query parameter
- Sets `parentIssueId` for all child issues (breadcrumb navigation)
- Stores `childrenJson` on parent issue

### `scripts/sync-query.js`

Syncs issues from a saved Redmine query.

```bash
node scripts/sync-query.js <query_id>

# Examples
node scripts/sync-query.js 744   # 8 issues
node scripts/sync-query.js 747   # 69 issues
node scripts/sync-query.js 749   # 21 issues
```

**Note:** Some queries may not be accessible via REST API (private queries or those requiring special permissions).

### `scripts/sync-query-details.js`

Syncs children and time entries for all issues returned by one or more saved queries.

```bash
node scripts/sync-query-details.js <query_id1> <query_id2> ...

# Example
node scripts/sync-query-details.js 754 755 749 743 744 747
```

**How it works:**
- Fetches issue IDs from all specified queries (lightweight)
- For each unique issue: fetches children + time entries from Redmine
- Upserts directly into Supabase
- Processes 5 issues in parallel for speed

### `scripts/sync-time-entries.js`

Compares time entries between Redmine API and local Supabase database. Shows discrepancies for data integrity verification.

```bash
node scripts/sync-time-entries.js <issue_id>

# Example
node scripts/sync-time-entries.js 113112
```

**Output shows:**
- Side-by-side comparison of all entries
- Missing, extra, or mismatched entries
- Total hours comparison

## Catalog Sync

### `scripts/sync-users.js`

Extracts unique users from Redmine issues (author, assigned_to) and stores them in the `RedmineUser` table.

```bash
node scripts/sync-users.js
```

**Usage:** The synced users are used for issue assignment in the Quick Actions panel.

### `scripts/sync-enums.js`

Fetches Redmine enumerations (issue priorities, time entry activities, document categories) and stores them in `RedmineEnumeration`.

```bash
node scripts/sync-enums.js
```

## Utility Scripts

### `scripts/db-status.js`

Quick check of database state — total issues, parent-child breakdown, and issues per user.

```bash
node scripts/db-status.js
```

**Sample output:**
```
📊 Supabase Issue Table
━━━━━━━━━━━━━━━━━━━━━━━━
Total issues:          393
  With parent:         381
  Without parent:      12

👥 Issues per user:
  cmnuhn4m...  393
```

### `scripts/check-issues.js`

Quick check of issue count and latest issue in Supabase.

```bash
node scripts/check-issues.js
```

### `scripts/check-sync-jobs.js`

Check sync job history and status.

```bash
node scripts/check-sync-jobs.js
```

### `scripts/trigger-sync.js`

Trigger a manual sync via the web API (requires session cookie).

```bash
node scripts/trigger-sync.js 'session_cookie_here'
```

## Environment Variables

All scripts require these in `.env`:

```bash
REDMINE_BASE_URL="https://redmine.nasctech.com"
REDMINE_API_KEY="your-api-key"
DATABASE_URL="postgresql://..."   # Supabase connection
```

## Data Safety

**All syncs are strictly additive (upsert only).** The destructive `deleteMany` operation that previously ran during system sync jobs has been disabled to prevent accidental data loss.

**Never run `DELETE FROM "Issue"` manually** unless you're intentionally clearing the database.

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

### Issue Fields Synced

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
