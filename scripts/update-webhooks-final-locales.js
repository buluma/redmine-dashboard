const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(fs.realpathSync(enPath), 'utf8'));

currentEn.webhooks = {
  ...currentEn.webhooks,
  "accessDenied": "Access Denied",
  "noPermission": "You don't have permission to manage webhooks.",
  "backToDashboard": "Back to Dashboard",
  "kicker": "Integrations",
  "subtitle": "Manage external endpoints that receive ticket events",
  "deliveryLogs": "📋 Delivery Logs",
  "deliveryStatus": "Delivery Status",
  "eventTypes": "Event Types",
  "failures": "Failures",
  "lastDelivery": "Last Delivery",
  "totalLabel": "Total",
  "activeLabel": "Active",
  "inactiveLabel": "Inactive",
  "withSecretLabel": "With Secret",
  "availableEventTypes": "Available Event Types",
  "eventLabel": "Event",
  "descriptionLabel": "Description",
  "newTicketCreated": "New ticket created",
  "ticketDetailsChanged": "Ticket details changed",
  "ticketStatusChanged": "Ticket status changed",
  "ticketAssigned": "Ticket assigned to user",
  "ticketCompleted": "Ticket marked as completed",
  "ticketDeleted": "Ticket deleted (future)"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Webhooks final keys');
