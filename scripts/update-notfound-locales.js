const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(fs.realpathSync(enPath), 'utf8'));

currentEn.notFound = {
  "title": "Page Not Found",
  "description": "The page you're looking for doesn't exist or has been moved.",
  "goBack": "Go Back",
  "backToDashboard": "Back to Dashboard",
  "helpTitle": "Need help?",
  "helpHint": "Try these:",
  "searchDashboard": "Search for your issue on the {link}",
  "checkReports": "Check the {link} for filtered views",
  "manualSync": "Run a {link} if data seems stale",
  "dashboardLink": "dashboard",
  "reportsLink": "reports page",
  "manualSyncLink": "manual sync"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Not Found keys');
