const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.createIssue = {
  "title": "🆕 Create New Issue",
  "projectLabel": "Project *",
  "projectPlaceholder": "Select a project...",
  "subjectLabel": "Subject *",
  "subjectPlaceholder": "Brief summary of the issue",
  "descriptionLabel": "Description",
  "descriptionPlaceholder": "Detailed explanation...",
  "statusLabel": "Status",
  "priorityLabel": "Priority",
  "dueDateLabel": "Due Date",
  "cancelBtn": "Cancel",
  "createBtn": "Create Issue",
  "creatingBtn": "Creating...",
  "successToast": "Issue created successfully",
  "errorRequired": "Subject and Project are required",
  "errorFailed": "Failed to create issue"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with createIssue keys');
