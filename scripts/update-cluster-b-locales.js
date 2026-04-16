const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.personalTickets = {
  "kicker": "Tickets",
  "title": "Personal Tickets",
  "desc": "Track personal work items locally.",
  "boardTitle": "📋 My Tickets",
  "boardDesc": "Personal tickets — local only, never synced to Redmine",
  "noTickets": "No personal tickets found. Create one from the dashboard.",
  "due": "Due {date}",
  "ticketDefault": "Ticket",
  "timeAgo": {
    "m": "{count}m ago",
    "h": "{count}h ago",
    "d": "{count}d ago"
  }
};

currentEn.heimdall = {
  "kicker": "Streamline",
  "title": "Heimdall",
  "summary": "Streamline Application Logs — {total} records · {errors} errors/warnings · {hosts} host(s)",
  "refreshBtn": "Refresh",
  "autoRefreshOn": "Auto-refresh ON",
  "autoRefreshOff": "Auto-refresh OFF",
  "noLogsTitle": "No Logs Imported Yet",
  "noLogsDesc": "Fetch logs from Streamline using the Ansible playbooks in debugging/, then import them with node scripts/import-streamline-logs.js.",
  "statMbu": "MBU Logs",
  "statSsr": "Server Side Rules",
  "statTraces": "Traces",
  "statErrors": "Errors & Warnings",
  "trendTitle": "📈 Trend Count Report",
  "trendDesc": "Daily log counts for the past 7 days",
  "mbuLevelsTitle": "MBU Log Levels",
  "ssrStatusTitle": "SSR Status",
  "traceLevelsTitle": "Trace Levels",
  "topScriptsTitle": "Top Scripts",
  "errorsTitle": "⚠️ Errors & Warnings",
  "errorsDesc": "{count} issues requiring attention",
  "showingXofY": "Showing {count} of {total} errors/warnings.",
  "noMbuLogs": "No MBU logs yet.",
  "noSsrLogs": "No SSR logs yet.",
  "noTraces": "No traces yet.",
  "noScripts": "No scripts yet."
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Cluster B keys');
