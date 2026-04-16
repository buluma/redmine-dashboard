const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.ops = {
  ...currentEn.ops,
  "userMgmtTitle": "User Management",
  "userMgmtDesc": "Manage user roles and permissions",
  "backToOps": "← Back to Ops",
  "allUsers": "All Users",
  "userCount": "{count} users",
  "colUser": "User",
  "colRole": "Role",
  "colConnected": "Connected Redmine",
  "colJoined": "Joined",
  "notConnected": "Not connected",
  "you": "(You)",
  "roles": {
    "Administrator": "Administrator",
    "Editor": "Editor",
    "User": "User",
    "Viewer": "Viewer"
  },
  "accessDenied": "Access Denied",
  "adminOnly": "Only administrators can manage users."
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with User Management keys');
