const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.nav = {
  ...currentEn.nav,
  "groups": {
    "personal": "Personal",
    "teamOps": "Team Ops",
    "reporting": "Reporting",
    "integrations": "Integrations",
    "system": "System",
    "other": "Other"
  },
  "tooltips": {
    "expand": "Expand menu",
    "collapse": "Collapse menu"
  }
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with nav groups');
