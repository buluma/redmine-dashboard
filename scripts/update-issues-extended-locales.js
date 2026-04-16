const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(fs.realpathSync(enPath), 'utf8'));

currentEn.issues = {
  ...currentEn.issues,
  "showCode": "Show code ({count} lines)",
  "notSet": "Not set",
  "ago": {
    "s": "{count}s ago",
    "m": "{count}m ago",
    "h": "{count}h ago",
    "d": "{count}d ago"
  },
  "tabs": {
    "history": "History",
    "notes": "Notes",
    "internalNotes": "Internal Notes",
    "properties": "Properties",
    "timeEntries": "Time Entries"
  },
  "messages": {
    "refreshed": "Issue refreshed from Redmine.",
    "personalUpdated": "Personal ticket updated.",
    "redmineUpdated": "Issue updated in Redmine successfully.",
    "githubLinked": "GitHub link added.",
    "githubRemoved": "GitHub link removed.",
    "noteFailed": "Failed to add note"
  },
  "fields": {
    "author": "Author",
    "created": "Created",
    "updated": "Updated",
    "priority": "Priority",
    "status": "Status",
    "assignee": "Assignee",
    "startDate": "Start Date",
    "dueDate": "Due Date",
    "estimatedHours": "Estimated Hours",
    "spentHours": "Spent Hours",
    "done": "Done"
  },
  "sections": {
    "attachments": "Attachments",
    "relations": "Relations",
    "subtickets": "Subtickets",
    "history": "History",
    "github": "GitHub References"
  },
  "empty": {
    "attachments": "No attachments",
    "relations": "No relations",
    "subtickets": "No subtickets",
    "github": "No GitHub references linked yet"
  },
  "placeholders": {
    "comment": "Add a comment...",
    "internalNote": "Write an internal note..."
  },
  "actions": {
    "save": "Save",
    "cancel": "Cancel",
    "edit": "Edit",
    "delete": "Delete",
    "refresh": "Refresh",
    "linkGithub": "Link GitHub"
  }
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Issues extended keys');
