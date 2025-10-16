/* global document $ chrome ClipboardJS */
const debug = false;
const once = {
  once: true
};

// Ensure a shared host object is available (popup-helpers.js typically sets window.$host).
if (typeof window.$host === 'undefined') {
  window.$host = (typeof host !== 'undefined') ? host : (typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : {}));
}
// Provide a safe storage fallback (minimal stub) to avoid runtime errors in non-browser test envs.
const storage = (window.$host && window.$host.storage && window.$host.storage.local) ? window.$host.storage.local : {
  get: (keys, cb) => { try { if (typeof cb === 'function') cb({}); } catch (e) {} },
  set: () => {},
  onChanged: { addListener: () => {} }
};

// Delegate common helpers to popup-helpers.js via window.popupHelpers when available.
// This keeps popup.js focused on the main popup logic while remaining backwards compatible.
const logger = (data) => { try { if (window.popupHelpers && window.popupHelpers.logger) return window.popupHelpers.logger(data); } catch (e) {} };
const analytics = (...args) => { try { if (window.popupHelpers && window.popupHelpers.analytics) return window.popupHelpers.analytics(...args); } catch (e) {} };
const renderChatMessage = (who, text) => { try { if (window.popupHelpers && window.popupHelpers.renderChatMessage) return window.popupHelpers.renderChatMessage(who, text); } catch (e) {} };
const display = (message) => { try { if (window.popupHelpers && window.popupHelpers.display) return window.popupHelpers.display(message); } catch (e) {} };
const show = (array, visible) => { try { if (window.popupHelpers && window.popupHelpers.show) return window.popupHelpers.show(array, visible); } catch (e) {} };
const enable = (array, isEnabled) => { try { if (window.popupHelpers && window.popupHelpers.enable) return window.popupHelpers.enable(array, isEnabled); } catch (e) {} };
const toggle = (e) => { try { if (window.popupHelpers && window.popupHelpers.toggle) return window.popupHelpers.toggle(e); } catch (err) {} };
const busy = (e) => { try { if (window.popupHelpers && window.popupHelpers.busy) return window.popupHelpers.busy(e); } catch (err) {} };
const updateScanButton = (isPageContextMode) => { try { if (window.popupHelpers && window.popupHelpers.updateScanButton) return window.popupHelpers.updateScanButton(isPageContextMode); } catch (err) {} };

// busy and updateScanButton are provided by popup-helpers and delegated via wrappers above.
function operation(e) {
    if (e.target.id === 'pom') {
    // Open the options page instead of legacy background helper (MV2 UI removed)
    try { $host.runtime.openOptionsPage(); } catch (err) { $host.tabs.create({ url: $host.runtime.getURL('src/options.html') }); }
    return;
  }

  // The new scan logic is handled client-side in the popup, so we don't send a message to background.
  if (e.target.id === 'scan') {
    const scanBtn = document.getElementById('scan');
    const originalText = scanBtn.textContent;
    const scriptToInject = 'src/content.js';

    scanBtn.textContent = 'Scanning...';
    scanBtn.disabled = true;

    const resetScanButton = () => {
      scanBtn.textContent = originalText;
      scanBtn.disabled = false;
    };

    getTargetTab((tab) => {
      if (!tab || !tab.id) {
        document.getElementById('textarea-script').value = 'Error: Could not find active tab to scan.';
        resetScanButton();
        return;
      }
      const tabId = tab.id;

      // Ensure content script is injected before sending a message.
      // This uses the modern scripting API for MV3, with a fallback.
      const injectionCallback = () => {
        const lastErr = $host.runtime.lastError;
        if (lastErr) {
          // Injection can fail on special pages (chrome://, etc.)
          document.getElementById('textarea-script').value = `Cannot scan this page.\nError: ${lastErr.message}`;
          resetScanButton();
          return;
        }

        // Now that we know the script is there, send the message.
        $host.tabs.sendMessage(tabId, { operation: 'get_dom_for_scan' }, (response) => {
          if ($host.runtime.lastError) {
            document.getElementById('textarea-script').value = `Scan failed.\nError: ${$host.runtime.lastError.message}`;
          } else if (response && response.html) {
            document.getElementById('textarea-script').value = response.html;
          }
          resetScanButton();
        });
      };

      if ($host.scripting && $host.scripting.executeScript) {
        $host.scripting.executeScript({ target: { tabId }, files: [scriptToInject] }, injectionCallback);
      } else {
        $host.tabs.executeScript(tabId, { file: scriptToInject }, injectionCallback);
      }
    });
    return;
  }

  toggle(e);
  const locators = $('#sortable').sortable('toArray', { attribute: 'id' });
  // Use a safe wrapper to avoid "The message port closed before a response was received." when
  // the background doesn't call sendResponse (MV3 service worker may terminate early).
  function safeSendMessage(message, cb) {
    try {
      $host.runtime.sendMessage(message, (resp) => {
        // runtime.lastError is set when the receiver doesn't send a response or when the
        // service worker has shut down. Treat these as benign and call the callback with
        // null response so UI code can continue without an uncaught runtime.lastError.
        const lastErr = $host.runtime && $host.runtime.lastError;
        if (lastErr) {
          if (typeof rcLog !== 'undefined') rcLog('debug', 'popup sendMessage lastError', lastErr.message);
          // still call callback with null/undefined so the popup UI can update safely
          if (typeof cb === 'function') cb(null);
          return;
        }
        if (typeof cb === 'function') cb(resp);
      });
    } catch (err) {
      if (typeof rcLog !== 'undefined') rcLog('error', 'popup safeSendMessage exception', err && err.message ? err.message : err);
      if (typeof cb === 'function') cb(null);
    }
  }

  safeSendMessage({ operation: e.target.id, locators }, display);

  analytics(['_trackEvent', e.target.id, '^-^']);
}
// some of the button stuff is here
function settings(e) {
  const locators = $('#sortable').sortable('toArray', { attribute: 'id' });
  const demo = document.getElementById('demo').checked;
  const verify = document.getElementById('verify').checked;
  // use safeSendMessage if available (defined inside operation function scope)
  if (typeof safeSendMessage === 'function') {
    safeSendMessage({ operation: 'settings', locators, demo, verify });
  } else {
    try {
      $host.runtime.sendMessage({ operation: 'settings', locators, demo, verify });
    } catch (e) {
      if (typeof rcLog !== 'undefined') rcLog('error', 'settings sendMessage exception', e && e.message ? e.message : e);
    }
  }
  analytics(['_trackEvent', 'setting', e.target.id]);
}

function info() {
  if (typeof safeSendMessage === 'function') {
    safeSendMessage({ operation: 'info' });
  } else {
    try {
      $host.runtime.sendMessage({ operation: 'info' });
    } catch (e) {
      if (typeof rcLog !== 'undefined') rcLog('error', 'info sendMessage exception', e && e.message ? e.message : e);
    }
  }

  analytics(['_trackEvent', 'info', 'ℹ️']);
}

function like() {
  analytics(['_trackEvent', 'like', '👍']);
}

// function pomSave() {
//   var ta = document.getElementById("tempDiv").getElementsByTagName("textarea");
//   var activities = document.getElementById("keywordSelect");
//   var index = activities.selectedIndex;
//   var arrGuments = [];
//   arrGuments.push(JSON.parse(activities.options[index].value).keyword);
//   for (let element of ta) {
//     arrGuments.push(element.value);
//   }

//   host.runtime.sendMessage({ operation: "pomer", results: arrGuments });
// }

document.addEventListener(
  'DOMContentLoaded',
  () => {
    // AI provider badge: show which provider is active (mqtt or gemini)
    function updateAiProviderBadge(provider) {
      try {
        const badge = document.getElementById('ai-provider-badge');
        if (!badge) return;
        const p = provider || 'unknown';
        badge.textContent = `AI: ${p}`;
        if (p === 'gemini') {
          badge.style.background = '#10b981'; // green
        } else if (p === 'mqtt') {
          badge.style.background = '#6366f1'; // indigo
        } else {
          badge.style.background = '#6b7280'; // gray
        }
      } catch (e) {}
    }

    // Load initial provider value
    try { storage.get({ ai_provider: 'mqtt' }, (s) => updateAiProviderBadge(s.ai_provider)); } catch (e) {}

    // Make badge clickable: click to toggle provider (mqtt <-> gemini); shift-click opens options
    try {
      const badge = document.getElementById('ai-provider-badge');
      if (badge) {
        badge.title = 'Click to toggle AI provider (Shift+click opens Options)';
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', (ev) => {
          try {
            if (ev.shiftKey) { // open options when Shift-clicked
              try { $host.runtime.openOptionsPage(); } catch (e) { $host.tabs.create({ url: $host.runtime.getURL('src/options.html') }); }
              return;
            }
            storage.get({ ai_provider: 'mqtt' }, (s2) => {
              const cur = (s2 && s2.ai_provider) || 'mqtt';
              const next = cur === 'mqtt' ? 'gemini' : 'mqtt';
              storage.set({ ai_provider: next }, () => {
                updateAiProviderBadge(next);
                const respDiv = document.getElementById('chat-response');
                if (respDiv) respDiv.textContent = `AI provider switched to ${next}`;
              });
            });
          } catch (e) { /* ignore */ }
        });
      }
    } catch (e) {}

    // Update badge live when storage changes
    $host.storage.onChanged.addListener((changes) => {
      if (changes.ai_provider) updateAiProviderBadge(changes.ai_provider.newValue);
    });

    // Share UI steps badge: show whether it's active
    function updateShareStepsBadge(isShared) {
      try {
        const badge = document.getElementById('share-ui-steps-badge');
        if (!badge) return;
        badge.textContent = isShared ? 'UI Steps: On' : 'UI Steps: Off';
        if (isShared) {
          badge.style.background = '#10b981'; // green
        } else {
          badge.style.background = '#6b7280'; // gray
        }
      } catch (e) {}
    }

    // Load initial share_ui_steps value
    try { storage.get({ share_ui_steps: false }, (s) => updateShareStepsBadge(!!(s && s.share_ui_steps))); } catch (e) {}

    // Make badge clickable to toggle sharing
    try {
      const badge = document.getElementById('share-ui-steps-badge');
      if (badge) {
        badge.title = 'Click to toggle sharing UI steps with AI';
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', () => {
          try {
            storage.get({ share_ui_steps: false }, (s) => {
              const current = !!(s && s.share_ui_steps);
              const next = !current;
              storage.set({ share_ui_steps: next }, () => updateShareStepsBadge(next));
            });
          } catch (e) { /* ignore */ }
        });
      }
    } catch (e) {}

    // Update share badge live when storage changes
    $host.storage.onChanged.addListener((changes) => { if (changes.share_ui_steps) updateShareStepsBadge(changes.share_ui_steps.newValue); });

    // chrome.storage.local.get(/* String or Array */ ["pom"], function (items) {
    //   //  items = [ { "phasersTo": "awesome" } ]
    //   var arr = JSON.parse(items.pom);
    //   var x = document.getElementById("keywordSelect");

    //   for (let i = 0; i < arr.length; i++) {
    //     var option = document.createElement("option");
    //     option.text = arr[i].keyword;
    //     option.value = JSON.stringify(arr[i]);
    //     x.add(option);
    //   }
    // });
    const appendDiv = document.getElementById('keywordDiv');

    //     activities.addEventListener("onchange", function()
    $('#keywordSelect').change((select) => {
      // Legacy helper popup removed; open options page as a replacement
      try { $host.runtime.openOptionsPage(); } catch (err) { $host.tabs.create({ url: $host.runtime.getURL('src/options.html') }); }

      //   var killDiv = document.getElementById("tempDiv");
      //   if (killDiv !== null) {
      //     killDiv.remove();
      //   }
      //   var tempDiv = document.createElement("div");
      //   tempDiv.id = "tempDiv";
      //   appendDiv.appendChild(tempDiv);
      //   console.log(select);
      //   var activities = document.getElementById("keywordSelect");

      //   var index = activities.selectedIndex;
      //   var reObj = JSON.parse(activities.options[index].value);
      //   console.log(index, reObj, reObj.arguments.number);
      //   for (let i = 0; i < reObj.arguments.number; i++) {
      //     var btn = document.createElement("textarea"); // Create a <button> element
      //     // btn.innerText = `${reObj.arguments.types[i]}`; // Insert text
      //     btn.value = `${reObj.arguments.types[i]}`; // Insert text
      //     if (reObj.arguments.types[i] === "element") {
      //       btn.addEventListener("click", (eventx) => {
      //         console.log(eventx)
      //         document.addEventListener("keydown", (event) => {
      //           if (event.key === "h") {
      //             // case sensitive

    //             document.addEventListener("mousemove", recordClickHover, once);
    //             function recordClickHover(event) {
    //               btn.value=event.target;
    //               // const attr = scanner.parseNode(
    //               //   getTime(),
    //               //   event.target,
    //               //   strategyList
    //               // );
    //               // attr.type = "hover";
    //               // if (!handleByChange(attr.type)) {
    //               //   Object.assign(attr, { trigger: "hover" });
    //               //   host.runtime.sendMessage({
    //               //     operation: "action",
    //               //     script: attr,
    //               //   });
    //               // }
    //             }
    //           }
    //         });
    //       });
    //     }
    //     tempDiv.appendChild(btn); // Append <button> to <body>
    //   }
    //   var submitButton = document.createElement("input");
    //   submitButton.type = "button";
    //   submitButton.value = "submit";
    //   submitButton.textContent = "submit";
    //   tempDiv.appendChild(submitButton);
    //   submitButton.addEventListener("click", pomSave);
    });
    storage.get(
      {
        message: 'Record or Scan',
        operation: 'stop',
        canSave: false,
        isBusy: false,
        demo: false,
        verify: false,
        locators: [],
        pageContextMode: false
      },
      (state) => {
        display({ message: state.message });
        toggle({
          target: { id: state.operation },
          canSave: state.canSave,
          isBusy: state.isBusy,
          demo: state.demo,
          verify: state.verify
        });
        // Update scan button text based on pageContextMode
        updateScanButton(state.pageContextMode);
        setTimeout(() => {
          const sortable = document.getElementById('sortable');
          state.locators.forEach((locator) => {
            const li = document.createElement('li');
            li.appendChild(document.createTextNode(locator));
            li.setAttribute('id', locator);
            li.setAttribute('class', 'ui-state-default');
            sortable.appendChild(li);
          });
        }, 200);
      }
    );

    debug
      ? document.getElementById('textarea-log').classList.remove('hidden')
      : 0;

    // Options opener and MQTT status
    const openOptionsBtn = document.getElementById('open-options');
    if (openOptionsBtn) {
      openOptionsBtn.addEventListener('click', () => {
        // open options page in a new tab
        try { $host.runtime.openOptionsPage(); } catch (e) { $host.tabs.create({ url: $host.runtime.getURL('src/options.html') }); }
      });
      // add a visible label if button has no content (icon-only themes)
      if (!openOptionsBtn.textContent || openOptionsBtn.textContent.trim() === '') openOptionsBtn.textContent = 'Options';
    }

    // Pin/Unpin window button
    const pinBtn = document.getElementById('pin');
    function updatePinUi(pinned) {
      if (!pinBtn) return;
      pinBtn.textContent = pinned ? 'Unpin' : 'Pin';
      pinBtn.title = pinned ? 'unpin window (close pinned window)' : 'pin window (keep open)';
    }

    // fetch pinnedWindowId from storage and update UI
    try {
      storage.get({ pinnedWindowId: null }, (s) => {
        updatePinUi(!!(s && s.pinnedWindowId));
      });
    } catch (e) { /* ignore */ }

    if (pinBtn) {
      pinBtn.addEventListener('click', async () => {
        try {
          storage.get({ pinnedWindowId: null }, async (s) => {
            const winId = s && s.pinnedWindowId;
            if (winId) {
              // unpin: try to remove/close the pinned window
              try {
                await new Promise((res) => $host.windows.remove(winId, () => res()));
              } catch (e) {
                // ignore if window already closed
              }
              storage.set({ pinnedWindowId: null });
              updatePinUi(false);
            } else {
              // pin: create a new window showing the popup page (open as a popup window)
              const url = $host.runtime.getURL('src/popup.html');
              try {
                $host.windows.create({ url, type: 'popup', width: 420, height: 640 }, (created) => {
                  if (created && created.id) {
                    storage.set({ pinnedWindowId: created.id });
                    updatePinUi(true);
                  }
                });
              } catch (e) {
                // some platforms may disallow windows.create from a popup; fallback to opening a tab
                try { $host.tabs.create({ url }); } catch (err) {}
              }
            }
          });
        } catch (e) { console.warn('pin handler error', e); }
      });
    }

    // Show mqtt status (enabled/disabled + broker url)
    try {
      storage.get({ mqtt_ctrl_enabled: false, mqtt_ctrl_broker: {}, mqtt_broker: {} }, (s) => {
        const broker = (s.mqtt_ctrl_broker && Object.keys(s.mqtt_ctrl_broker).length) ? s.mqtt_ctrl_broker : (s.mqtt_broker || {});
        const st = (typeof s.mqtt_ctrl_enabled !== 'undefined') ? (s.mqtt_ctrl_enabled ? 'enabled' : 'disabled') : (s.mqtt_enabled ? 'enabled' : 'disabled');
        const url = (broker && broker.brokerUrl) ? broker.brokerUrl : 'ws://localhost:9001';
        const el = document.getElementById('mqtt-status');
        if (el) el.textContent = `MQTT: ${st} — ${url}`;
      });
    } catch (e) { if (typeof rcLog !== 'undefined') rcLog('error', 'failed to read mqtt status', e && e.message ? e.message : e); }

    // Load share UI steps flag for popup checkbox
    try {
      storage.get({ share_ui_steps: false }, (s) => {
        const el = document.getElementById('share-ui-steps');
        if (el) el.checked = !!(s && s.share_ui_steps);
      });
    } catch (e) { /* ignore */ }

    ['record', 'resume', 'stop', 'pause', 'save', 'scan', 'pom'].forEach(
      (id) => {
        // add pom??
        document.getElementById(id).addEventListener('click', operation);
      }
    );

    // Run recorded steps in active tab
    const runBtn = document.getElementById('run');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        try {
          storage.get({ last_actions: [] }, (s) => {
            const list = s && Array.isArray(s.last_actions) ? s.last_actions : [];
            if (!list || list.length === 0) {
              alert('No recorded actions to run');
              return;
            }
            // send run_translated to background with the recorded list
            try {
              $host.runtime.sendMessage({ operation: 'run_translated', list }, (resp) => {
                const lastErr = $host.runtime && $host.runtime.lastError;
                if (lastErr) {
                  if (typeof rcLog !== 'undefined') rcLog('debug', 'run sendMessage lastError', lastErr.message);
                }
              });
            } catch (e) { if (typeof rcLog !== 'undefined') rcLog('error', 'run sendMessage failed', e && e.message ? e.message : e); }
          });
        } catch (e) { alert('Failed to read recorded actions'); }
      });
    }

    // AI Assist is initialized from popup-ai.js
    if (window._wb_initAiAssist) window._wb_initAiAssist();

    ['demo', 'verify'].forEach((id) => {
      document.getElementById(id).addEventListener('change', settings);
    });

    document.getElementById('like').addEventListener('click', like);
    document.getElementById('info').addEventListener('click', info);
    document.getElementById('settings').addEventListener('click', toggle);

      // Chat send handler is initialized from popup-chat.js
      if (window._wb_initChatSend) window._wb_initChatSend();

    $('#sortable').sortable({ update: settings });
    $('#sortable').disableSelection();
  },
  false
);

$host.storage.onChanged.addListener((changes, _) => {
  for (const key in changes) {
    if (key === 'isBusy') busy({ isBusy: changes.isBusy.newValue });
    if (key === 'message') display({ message: changes.message.newValue });
    if (key === 'pageContextMode') {
      updateScanButton(changes.pageContextMode.newValue);
    }
    if (key === 'share_ui_steps') {
      // This is handled by the new badge logic, but keeping for safety.
    }
  }
});

$host.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (typeof rcLog !== 'undefined') rcLog('info', 'popup active tab title', tabs[0] && tabs[0].title);
  storage.set({ default_tabs: 'default_tab', tabs, canSave: false });
});
