const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.heimdall = {
  ...currentEn.heimdall,
  "searchMbu": "Search MBU logs…",
  "searchSsr": "Search Server Side Rules logs…",
  "searchTrace": "Search Trace logs…",
  "allFilter": "All ({count})",
  "matchingSearch": " matching \"{search}\"",
  "noLogsMatch": "No logs match the current filters.",
  "collapse": "▲ collapse",
  "expand": "▼ expand",
  "idPrefix": "ID: ",
  "tracePrefix": " · Trace: ",
  "cpu": "🖥 CPU: {count}%",
  "ram": "💾 RAM: {size}",
  "resource": "Resource #{id}"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Heimdall Logs keys');
