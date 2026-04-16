const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/page.tsx');
let content = fs.readFileSync(fs.realpathSync(filePath), 'utf8');

const replacements = [
    [/\{t\('drawer\.date'\)\}/g, 'Date'],
    [/due\{t\('drawer\.date'\)\}/g, 'dueDate'],
    [/start\{t\('drawer\.date'\)\}/g, 'startDate'],
    [/get\{t\('drawer\.date'\)\}/g, 'getDate'],
    [/estimated\{t\('drawer\.hours'\)\}/g, 'estimatedHours'],
    [/last\{t\('drawer\.activity'\)\}At/g, 'lastActivityAt'],
    [/last\{t\('drawer\.activity'\)\}\{t\('drawer\.relType'\)\}/g, 'lastActivityType'],
    [/activity\{t\('drawer\.relType'\)\}Label/g, 'activityTypeLabel'],
    [/issue\{t\('drawer\.activity'\)\}Timestamp/g, 'issueActivityTimestamp'],
    [/Issue\{t\('drawer\.activity'\)\}Timestamp/g, 'IssueActivityTimestamp'],
    [/recent\{t\('drawer\.activity'\)\}/g, 'recentActivity'],
    [/set\{t\('drawer\.activity'\)\}FeedOpen/g, 'setActivityFeedOpen'],
    [/set\{t\('drawer\.timeComment'\)\}/g, 'setComment'],
    [/set\{t\('drawer\.hours'\)\}/g, 'setHours'],
    [/set\{t\('drawer\.activity'\)\}Id/g, 'setActivityId'],
    [/time\{t\('drawer\.timeComment'\)\}/g, 'timeComment'],
    [/setTime\{t\('drawer\.timeComment'\)\}/g, 'setTimeComment'],
    [/setRelation\{t\('drawer\.relType'\)\}/g, 'setRelationType'],
    [/activity\{t\('drawer\.relType'\)\}/g, 'activityType'],
    [/latestIssue\{t\('drawer\.activity'\)\}Timestamp/g, 'latestIssueActivityTimestamp'],
    [/activity\{t\('drawer\.activity'\)\}/g, 'activityActivity'] // just in case
];

for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
}

fs.writeFileSync(filePath, content);
console.log('Fixed corrupted patterns in app/page.tsx');
