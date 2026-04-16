const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.bulkActions = {
  "selectedCount": "{count} selected",
  "selectAction": "Select action...",
  "applyBtn": "Apply",
  "clearBtn": "Clear"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with bulkActions keys');
