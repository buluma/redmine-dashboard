const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(fs.realpathSync(enPath), 'utf8'));

currentEn.wakatime = {
  ...currentEn.wakatime,
  "reportWindow": "Report Window",
  "viewLabel": "{range} view",
  "loading": "Loading...",
  "rangeTotal": "Range Total",
  "dailyAverage": "Daily Average",
  "activeDays": "Active Days",
  "goals": "Goals",
  "allTimeLabel": "All Time",
  "streak": "{count}d streak",
  "daysInReport": "{count} days in report",
  "withCodingActivity": "{percent}% with coding activity",
  "goalsSuccessful": "goals currently successful",
  "noGoals": "No goals or missing read_goals scope",
  "today": "Today",
  "since": "since {time}",
  "dailyTrend": "Daily Coding Trend",
  "daysBadge": "{count} days",
  "performance": "Daily Performance",
  "percentOfAverage": "{percent}% of average",
  "vsAverage": "↑ {percent}% vs daily average",
  "vsAverageDown": "↓ {percent}% vs daily average",
  "dailyAvgLabel": "Daily avg:",
  "mostActiveLabel": "Most active:",
  "languages": "Languages",
  "projects": "Projects",
  "editors": "Editors",
  "top8": "top 8",
  "hours": "Hours",
  "top": "Top",
  "weekdayMix": "Weekday Activity Mix",
  "heartbeatsLabel": "heartbeats (7d)",
  "summariesLabel": "summaries fallback",
  "goalsProgress": "Goals Progress",
  "activeBadge": "{count} active",
  "topCodingDays": "Top Coding Days",
  "entriesBadge": "{count} entries",
  "events": "{count} {count, plural, one {event} other {events}}",
  "noActivityMix": "No activity mix data available.",
  "noHeartbeatsScope": "Heartbeats unavailable. Add read_heartbeats scope effectively power this with raw activity.",
  "noGoalsAvailable": "Goals unavailable. Confirm your key has read_goals access and a WakaTime premium plan.",
  "noCodingDays": "No coding days found for this range.",
  "tryLast30Days": "Try Last 30 Days",
  "vsEarlierPeriod": "{prefix}{percent}% vs earlier period",
  "h": "{hours}h",
  "m": "{minutes}m",
  "hm": "{hours}h {minutes}m"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with WakaTime extended keys');
