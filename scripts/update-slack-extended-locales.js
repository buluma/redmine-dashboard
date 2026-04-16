const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.slack = {
  ...currentEn.slack,
  "monitorCount": "{count} {count, plural, one {channel} other {channels}} monitored",
  "refresh": "⟳ Refresh",
  "refreshing": "⟳ Refreshing…",
  "autoRefreshOn": "Auto-refresh ON",
  "autoRefreshOff": "Auto-refresh OFF",
  "autoRefreshTitleOn": "Auto-refresh enabled (5 min)",
  "autoRefreshTitleOff": "Auto-refresh disabled",
  "testNotification": "Test Notification",
  "sending": "Sending…",
  "testSuccess": "Test notification sent!",
  "testNetworkError": "Network error",
  "testFailed": "Failed to send",
  "last": "Last: {time}",
  "channel": "Channel:",
  "loadingThread": "Loading thread...",
  "noMessages": "No messages found in #{channel}",
  "bot": "Bot",
  "joinedChannel": "{user} joined the channel",
  "leftChannel": "{user} left the channel",
  "pinnedMessage": "{user} pinned a message",
  "reply": "reply",
  "replies": "replies",
  "person": "person",
  "people": "people",
  "unknown": "unknown"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Slack extended keys');
