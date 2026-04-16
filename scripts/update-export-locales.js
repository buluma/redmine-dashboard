const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.export = {
  "csvBtn": "📥 CSV",
  "printBtn": "🖨️ Print",
  "reportTitle": "Issues Report",
  "generatedAt": "Generated: {date}",
  "printBtnAction": "Print",
  "colId": "ID",
  "colSubject": "Subject",
  "colStatus": "Status",
  "colPriority": "Priority",
  "colProject": "Project",
  "colAssignee": "Assignee",
  "colDue": "Due Date",
  "colUpdated": "Updated"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with export keys');
