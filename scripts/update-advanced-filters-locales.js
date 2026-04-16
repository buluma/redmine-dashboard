const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.advancedFilters = {
  "toggleBtn": "⚙️ Filters",
  "statusLabel": "Status",
  "priorityLabel": "Priority",
  "flagsLabel": "Flags",
  "hasGhLinks": "Has GitHub Links",
  "hasAttachments": "Has Attachments",
  "dueDateLabel": "Due Date",
  "anyOption": "Any",
  "within7Days": "Due within 7 days",
  "within14Days": "Due within 14 days",
  "within30Days": "Due within 30 days",
  "overdueOption": "Overdue",
  "updatedAfterLabel": "Updated After",
  "clearAllBtn": "Clear All",
  "doneBtn": "Done"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with advancedFilters keys');
