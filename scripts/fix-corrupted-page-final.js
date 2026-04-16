const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/page.tsx');
let content = fs.readFileSync(fs.realpathSync(filePath), 'utf8');

const replacements = [
    [/\"Content-\{t\(\'drawer\.relType\'\)\}\"/g, '"Content-Type"'],
    [/submit\{t\(\'drawer\.timeComment\'\)\}/g, 'submitTimeComment'],
    [/\{t\(\'drawer\.timeComment\'\)\} failed/g, 'Log time failed'],
    [/elapsed\{t\(\'drawer\.hours\'\)\}/g, 'elapsedHours'],
    [/Timer stopped\. \{t\(\'drawer\.hours\'\)\} prefilled to/g, 'Timer stopped. hours prefilled to'],
    [/Recent \{t\(\'drawer\.activity\'\)\} Feed/g, 'Recent Activity Feed'],
    [/set\{t\(\'drawer\.activity\'\)\}FeedOpen/g, 'setActivityFeedOpen'],
    [/set\{t\(\'drawer\.activity\'\)\}Id/g, 'setActivityId'],
    [/setTime\{t\(\'drawer\.timeComment\'\)\}/g, 'setTimeComment'],
    [/setRelation\{t\(\'drawer\.relType\'\)\}/g, 'setRelationType'],
];

for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
}

fs.writeFileSync(filePath, content);
console.log('Fixed final corrupted patterns in app/page.tsx');
