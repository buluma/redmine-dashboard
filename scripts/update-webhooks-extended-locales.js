const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(fs.realpathSync(enPath), 'utf8'));

currentEn.webhooks = {
  ...currentEn.webhooks,
  "title": "Webhook Subscriptions",
  "testAll": "🧪 Test All",
  "sending": "Sending...",
  "cancelEdit": "✕ Cancel Edit",
  "addSubscription": "+ Add Subscription",
  "cancel": "✕ Cancel",
  "newWebhook": "New Webhook Subscription",
  "editWebhook": "Edit: {name}",
  "nameLabel": "Name *",
  "urlLabel": "Webhook URL *",
  "secretLabel": "Secret (optional, for HMAC signing)",
  "secretEditLabel": "Secret (leave empty to keep current)",
  "eventsLabel": "Events to Subscribe *",
  "eventsLabelShort": "Events *",
  "namePlaceholder": "My External System",
  "urlPlaceholder": "https://my-system.com/webhook",
  "secretPlaceholder": "Leave empty for no signing",
  "secretEditPlaceholder": "New secret (optional)",
  "createBtn": "Create Subscription",
  "creatingBtn": "Creating...",
  "saveBtn": "Save Changes",
  "savingBtn": "Saving...",
  "tableName": "Name",
  "tableUrl": "URL",
  "tableEvents": "Events",
  "tableStatus": "Status",
  "tableLast": "Last Delivery",
  "tableActions": "Actions",
  "noSubscriptions": "No webhook subscriptions yet. Click \"Add Subscription\" to create one.",
  "never": "Never",
  "edit": "Edit",
  "delete": "Delete",
  "confirmDelete": "Delete this webhook subscription?",
  "confirmTest": "Send test webhook to all active subscribers?",
  "testSent": "Test webhook sent! Check your endpoint logs.",
  "testFailed": "Failed to send test webhook",
  "selectOneEvent": "Select at least one event",
  "nameUrlRequired": "Name and URL are required",
  "updateFailed": "Failed to update webhook",
  "createFailed": "Failed to create webhook",
  "eventTicketCreated": "🎫 Created",
  "eventTicketUpdated": "📝 Updated",
  "eventTicketStatus": "🔄 Status",
  "eventTicketAssigned": "👤 Assigned",
  "eventTicketCompleted": "✅ Completed",
  "eventTicketDeleted": "🗑️ Deleted"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Webhooks extended keys');
