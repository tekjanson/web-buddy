/* messages.js
   Centralized message keys and storage keys used across background/content/options.
   Implemented as a browser-global for simplicity (loaded via manifest before other scripts).
*/

var MESSAGES = MESSAGES || {};

MESSAGES.OPERATIONS = {
  RECORD: 'record',
  PAUSE: 'pause',
  RESUME: 'resume',
  SCAN: 'scan',
  STOP: 'stop',
  SAVE: 'save',
  SETTINGS: 'settings',
  LOAD: 'load',
  INFO: 'info',
  ACTION: 'action',
  EXECUTE: 'execute'
};

MESSAGES.STORAGE_KEYS = {
  EXECUTION_POLICY: 'execution_policy',
  SUGGESTIONS: 'suggestions',
  ACTIONS_LOG: 'actions_log'
};

/* Safe export for CommonJS test runs */
if (typeof exports !== 'undefined') exports.MESSAGES = MESSAGES;
