const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, '../messages/en.json');
const currentEn = JSON.parse(fs.readFileSync(enPath, 'utf8'));

currentEn.shortcuts = {
  "title": "⌨️ Keyboard Shortcuts",
  "categories": {
    "Navigation": "Navigation",
    "Actions": "Actions",
    "Selection": "Selection",
    "Panels": "Panels",
    "View": "View"
  },
  "keys": {
    "j_desc": "Select next issue",
    "k_desc": "Select previous issue",
    "Enter_desc": "Open selected issue",
    "Escape_desc": "Close modal / deselect",
    "a_desc": "Toggle AI search panel",
    "r_desc": "Force refresh data",
    "f_desc": "Reset all filters",
    "slash_desc": "Focus search input",
    "g_desc": "Go to top of list",
    "x_desc": "Toggle selection on focused issue",
    "ShiftJ_desc": "Add next to selection",
    "ShiftK_desc": "Add previous to selection",
    "Asterisk_desc": "Select all visible issues",
    "Alt1_desc": "Jump to Insights",
    "Alt2_desc": "Jump to Alerts",
    "Alt3_desc": "Jump to Feed",
    "Alt4_desc": "Jump to Issue Queue",
    "Question_desc": "Show this help",
    "t_desc": "Toggle theme (dark/light)",
    "s_desc": "Toggle sync status"
  },
  "footerHelp": "Press {key1} or {key2} to close",
  "hint": "Press {key} for keyboard shortcuts"
};

fs.writeFileSync(enPath, JSON.stringify(currentEn, null, 2));
console.log('Updated messages/en.json with shortcuts keys');
