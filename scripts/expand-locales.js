const fs = require('fs');
const path = require('path');

const newEnStrings = {
  "login": {
    "kickerOps": "Operations",
    "missionControl": "Mission Control Dashboard",
    "connectDesc": "Connect your Redmine account and manage issues from one unified dashboard.",
    "baseUrlLabel": "Base URL",
    "apiKeyLabel": "API Key",
    "baseUrlPlaceholder": "https://redmine.example.com",
    "apiKeyPlaceholder": "your-redmine-api-key",
    "connecting": "Connecting...",
    "launchDashboard": "Launch Dashboard",
    "usingEnv": "Using .env...",
    "useEnvConfig": "Use .env Configuration",
    "envBootstrapHelp": ".env bootstrap is available only on first run (active credentials: {activeCredentials})."
  },
  "hero": {
    "kicker": "Operations Hub",
    "title": "Converge",
    "signedInAs": "Signed in as {displayName} ({username})",
    "syncStatus": "Sync: {status}",
    "syncWaiting": "Waiting for first sync",
    "syncLastError": "Last sync error: {error}",
    "aiCloud": "🤖 AI: Cloud",
    "aiFallback": "🤖 AI: Fallback",
    "refreshing": "Refreshing...",
    "forceRefresh": "Force Refresh",
    "resetFilters": "Reset Filters",
    "shortcutsBtn": "Shortcuts"
  },
  "metrics": {
    "visibleTotalLabel": "Visible / Total",
    "dueTodayInfo": "Due Today: {count}",
    "avgOpenAgeInfo": "Avg Since Update: {days}d",
    "openLabel": "Open",
    "inProgressFoot": "In progress: {count}",
    "riskBucketLabel": "Risk Bucket",
    "riskFoot": "Overdue issues • Due soon: {count}",
    "deliveryHealthLabel": "Delivery Health",
    "deliveryHealthFoot": "Done: {done} • Avg done ratio: {ratio}%",
    "blockedLabel": "Blocked",
    "blockedFoot": "Status contains blocked/hold/waiting",
    "staleQueueLabel": "Stale Queue",
    "staleQueueFoot": "No visible activity in 3+ days • Avg since activity: {days}d",
    "aiInsightsLabel": "AI Insights",
    "aiInsightsNone": "No available AI insights. Check again later!",
    "aiInsightsOne": "1 AI insight generated",
    "aiInsightsMany": "{count} AI insights generated"
  },
  "filters": {
    "status": "Status",
    "allStatuses": "All Statuses",
    "priority": "Priority",
    "allPriorities": "All Priorities",
    "sort": "Sort",
    "sortNewest": "Activity (Newest)",
    "sortOldest": "Activity (Oldest)",
    "sortPriority": "Priority",
    "sortDueDate": "Due Date",
    "search": "Search",
    "searchPlaceholder": "Subject, description, assignee",
    "searchSource": "Search Source",
    "sourceLocal": "Local Cache",
    "sourceHybrid": "Hybrid (Redmine + Cache)",
    "sourceFts": "Full-text Search (DB)",
    "modeLocal": "Local cache",
    "modeFts": "Full-text Search",
    "modeHybrid": "Hybrid",
    "aiSearchBtn": "🤖 AI Search",
    "ftsSearchBtn": "🔍 Full-text Search",
    "ftsClose": "Close"
  },
  "insights": {
    "statusMixTitle": "Status Mix",
    "statusMixDesc": "Click a status to filter quickly.",
    "noStatusData": "No status data yet.",
    "priorityMixTitle": "Priority Mix",
    "noPriorityData": "No priority data yet."
  },
  "collapsible": {
    "collapse": "Collapse",
    "expand": "Expand"
  },
  "opsAlerts": {
    "title": "Ops Alerts",
    "desc": "Highest risk issues based on overdue, blocked, and stale signals.",
    "noAlerts": "No active risk alerts.",
    "itemCount": "{count} alert item(s)."
  },
  "activityFeed": {
    "title": "Recent Activity Feed",
    "desc": "Last {count} events from updates, comments, and timelogs.",
    "hiddenFeed": "Hidden feed. {count} event(s) available.",
    "loggedHours": "{hours}h logged {activityName}",
    "commented": "{author} commented"
  },
  "analytics": {
    "title": "📊 Analytics Dashboard",
    "desc": "Issue trends and workload distribution"
  },
  "queue": {
    "title": "Issue Queue",
    "loaded": "{count} loaded",
    "openStats": " · Open: {count}",
    "inProgressStats": " · In Progress: {count}",
    "blockedStats": " · Blocked: {count}",
    "overdueStats": " · Overdue: {count}",
    "selected": "Selected: {count}",
    "dueToday": " • Due today: {count}",
    "bulkStatus": "Bulk Status",
    "applySelected": "Apply to Selected",
    "applying": "Applying...",
    "clearSelection": "Clear Selection",
    "filterAll": "All ({count})",
    "filterOpen": "🟢 Open ({count})",
    "filterInProgress": "🔵 In Progress ({count})",
    "filterBlocked": "🛑 Blocked ({count})",
    "filterOverdue": "⚠️ Overdue ({count})",
    "presets": "Presets",
    "newIssue": "+ New Issue",
    "saveFilters": "💾",
    "favoritesOn": "★ Favorites",
    "favoritesOff": "☆ Favorites",
    "viewList": "📑 List",
    "viewBoard": "🗂 Board",
    "viewGantt": "📈 Gantt",
    "colId": "ID",
    "colSubject": "Subject",
    "colStatus": "Status",
    "colPriority": "Priority",
    "colDue": "Due",
    "colProgress": "Progress",
    "colActivity": "Activity",
    "dragToReorder": "Drag to reorder",
    "ghLinks": "GH: {count} link(s)",
    "attachmentsCount": "Attachments: {count}",
    "relationsCount": "Relations: {count}"
  },
  "pagination": {
    "pageInfo": "Page {current} of {max}",
    "showing": " · Showing {start}–{end} of {total}",
    "filtered": " (filtered from {unfilteredTotal})",
    "queueHidden": "Queue hidden. {loadedCount} issue(s) loaded, {selectedCount} selected."
  },
  "preview": {
    "status": "Status: {name}",
    "progress": "Progress: {ratio}%",
    "due": "Due: {date}",
    "noDesc": "No description."
  },
  "drawer": {
    "noProject": "No Project",
    "noPriority": "No Priority",
    "redmineSource": "Redmine source:",
    "children": "Children: {ids}",
    "close": "Close",
    "ghLinksTitle": "GitHub Links",
    "ghRepo": "Repository (`owner/repo`)",
    "ghIssueNum": "GitHub Issue #",
    "ghPrNum": "GitHub PR #",
    "ghUrl": "Direct URL (optional)",
    "ghTitle": "Title (optional)",
    "linking": "Linking...",
    "addGhLink": "Add GitHub Link",
    "noGhLinks": "No GitHub links yet.",
    "remove": "Remove",
    "attachmentsTitle": "Attachments",
    "attachFile": "File",
    "attachDesc": "Description (optional)",
    "uploading": "Uploading...",
    "uploadAttach": "Upload Attachment",
    "noAttach": "No attachments yet.",
    "unknownAuthor": "Unknown author",
    "previewMsg": "Preview {filename}",
    "relationsTitle": "Relations",
    "relIssueId": "Issue #",
    "relType": "Type",
    "relDelay": "Delay (optional)",
    "saving": "Saving...",
    "addRelation": "Add Relation",
    "noRelations": "No relations yet.",
    "delayDays": "Delay: {count} day(s)",
    "descTitle": "Description",
    "commentsTitle": "Comments",
    "shareUpdate": "Share an update",
    "postComment": "Post Comment",
    "noComments": "No comments yet.",
    "timeLogsTitle": "Time Logs",
    "startTimer": "Start Timer",
    "runningTime": "Running: {time}",
    "stopFill": "Stop and Fill Hours",
    "timerRunningInfo": "Timer is currently running on issue #{id}.",
    "hours": "Hours",
    "activity": "Activity",
    "date": "Date",
    "timeComment": "Comment",
    "timeCommentPlaceholder": "Summarize the work",
    "addTimeLog": "Add Time Log",
    "noTimeLogs": "No time entries yet.",
    "syncedFromRedmine": "Synced from Redmine",
    "localEntry": "Local entry",
    "noTimeComment": "(no comment)"
  },
  "toasts": {
    "manualPullSuccess": "Manual full refresh completed.",
    "manualPullFailed": "Manual pull failed",
    "envSuccess": "Connected using .env configuration.",
    "envFailed": "Unable to bootstrap from environment.",
    "statusNotAllowed": "Selected status is not allowed for this issue.",
    "statusFailed": "Status update failed",
    "bulkFailedLog": "Updated {updated} issue(s), {failed} failed. Open browser console for details.",
    "bulkSuccess": "Updated {updated} issue(s).",
    "bulkUpdateFailed": "Bulk status update failed",
    "dropFailed": "Kanban drop failed. Reverting...",
    "commentFailed": "Comment failed",
    "timeLogAdded": "Time entry added.",
    "timeLogFailed": "Timelog failed",
    "ghLinkAdded": "GitHub link added.",
    "ghLinkFailed": "Unable to link GitHub reference",
    "ghLinkRemoved": "GitHub link removed.",
    "ghRemoveFailed": "Unable to remove GitHub link",
    "attachAdded": "Attachment uploaded.",
    "attachFailed": "Unable to upload attachment",
    "relAdded": "Relation added.",
    "relFailed": "Unable to add relation",
    "relRemoved": "Relation removed.",
    "relRemoveFailed": "Unable to remove relation",
    "timerStarted": "Started timer for issue #{id}.",
    "timerStopped": "Timer stopped. Hours prefilled to {hours}.",
    "invalidRelId": "Enter a valid related issue ID.",
    "viewSavedChanges": "Saved changes to view \"{name}\".",
    "viewSaved": "Saved view \"{name}\".",
    "viewRemoved": "Removed view \"{name}\"."
  }
};

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Deep merge
const merged = { ...currentEn };
for (const [key, value] of Object.entries(newEnStrings)) {
  if (merged[key] && typeof merged[key] === 'object') {
    merged[key] = { ...merged[key], ...value };
  } else {
    merged[key] = value;
  }
}

fs.writeFileSync(enPath, JSON.stringify(merged, null, 2));
console.log('Updated messages/en.json');
