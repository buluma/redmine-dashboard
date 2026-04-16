const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.ops = {
  ...currentEn.ops,
  "auditLogsTitle": "Audit Logs",
  "auditLogsDesc": "Compliance and security audit trail",
  "permissionDenied": "You don't have permission to view audit logs.",
  "activity24h": "Activity (24h)",
  "overview": "Overview",
  "todayEvents": "{count} events",
  "creates": "Creates",
  "updates": "Updates",
  "deletes": "Deletes",
  "showingEvents": "Showing: {count} events",
  "uniqueUsers": "Unique Users",
  "recentEvents": "Recent Audit Events",
  "colTimestamp": "Timestamp",
  "colEntity": "Entity",
  "colEntityType": "Entity Type",
  "colIpAddress": "IP Address",
  "noAuditLogs": "No audit logs yet.",
  "logDetails": "Log Details",
  "colChanges": "Changes",
  "colMetadata": "Metadata"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Audit Logs keys');
