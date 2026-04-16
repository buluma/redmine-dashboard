const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.chat = {
  ...currentEn.chat,
  "welcomeTitle": "Hello! I'm your AI assistant. I can help you with:",
  "welcomeItem1": "Searching and analyzing Redmine issues",
  "welcomeItem2": "Answering questions about your project logs",
  "welcomeItem3": "Finding information in system traces",
  "welcomeItem4": "Summarizing error patterns",
  "welcomeActionsTitle": "🛠️ I can also take actions on your behalf:",
  "welcomeAction1": "Update issue status",
  "welcomeAction2": "Log time entries",
  "welcomeAction3": "Add comments",
  "welcomeAction4": "Close issues",
  "welcomeFooter": "Mutating actions always require your confirmation first.\n\nHow can I help you today?",
  "roleYou": "You",
  "roleAi": "AI",
  "roleSystem": "System",
  "typing": "typing...",
  "placeholder": "Type your message... (e.g. \"close issue #123\")",
  "send": "Send",
  "proposedActions": "Proposed Actions",
  "actionsProcessed": "Actions Processed",
  "confirm": "Confirm",
  "reject": "Reject",
  "errorResponse": "I couldn't get a response. Please try again.",
  "errorGeneral": "Sorry, I encountered an error. Please try again.",
  "errorExecuting": "Sorry, there was an error executing the actions. Please try again.",
  "actionsCompleted": "Actions completed.",
  "actionsCancelled": "No problem — I've cancelled those actions. Let me know if you need anything else."
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with Chat keys');
