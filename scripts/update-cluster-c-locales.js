const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.chat = {
  "kicker": "Chat",
  "title": "AI Assistant",
  "desc": "Chat with AI about your Redmine issues and system logs."
};

currentEn.slack = {
  "kicker": "Slack",
  "title": "Slack Messages",
  "configRequired": "Configuration Required",
  "configError": "Configuration Error",
  "noChannels": "No Slack channels configured.",
  "botTokenError": "Slack bot token not configured.",
  "fetchFailed": "Failed to fetch Slack messages"
};

currentEn.wakatime = {
  "kicker": "WakaTime",
  "title": "Coding Stats",
  "poweredBy": "Powered by WakaTime",
  "totalTime": "total coding time",
  "notConfigured": "WakaTime Not Configured",
  "apiKeyHelp": "Set WAKATIME_API_KEY in your .env file to view your coding stats.",
  "errorLoading": "Error Loading WakaTime Data",
  "invalidKey": "Your WakaTime credential is invalid or expired.",
  "rateLimit": "WakaTime rate limit exceeded. Please wait a few minutes and try again.",
  "calculating": "WakaTime is still processing your stats. Try again in a moment."
};

currentEn.webhooks = {
  "kicker": "Integrations",
  "title": "Webhook Subscriptions",
  "desc": "Manage external endpoints that receive ticket events",
  "deliveryLogs": "📋 Delivery Logs",
  "subscriptions": "Subscriptions",
  "deliveryStatus": "Delivery Status",
  "eventTypes": "Event Types",
  "total": "Total",
  "active": "Active",
  "inactive": "Inactive",
  "withSecret": "With Secret",
  "failures": "Failures",
  "lastDelivery": "Last Delivery",
  "never": "Never",
  "noSubscriptions": "No subscriptions yet",
  "availableEventTypes": "Available Event Types",
  "eventCol": "Event",
  "descCol": "Description",
  "ticketCreatedDesc": "New ticket created",
  "ticketUpdatedDesc": "Ticket details changed",
  "ticketStatusChangedDesc": "Ticket status changed",
  "ticketAssignedDesc": "Ticket assigned to user",
  "ticketCompletedDesc": "Ticket marked as completed",
  "ticketDeletedDesc": "Ticket deleted (future)"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Cluster C keys');
