const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(fs.realpathSync(enPath), 'utf8'));

currentEn.offline = {
  "restored": "Connection Restored",
  "redirecting": "You're back online. Redirecting...",
  "title": "You're Offline",
  "cached": "Showing cached data. Some features may be limited.",
  "tip": "Tip: Visit issues while online to cache them for offline viewing.",
  "backToDashboard": "Back to Dashboard"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Offline keys');
