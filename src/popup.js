/* global document $ chrome ClipboardJS */
const debug = false;
const once = {
  once: true
};

const $host = (typeof host !== 'undefined') ? host : chrome;
const storage = $host.storage.local;

/*eslint-disable */
// Google Analytics removed for extension CSP and privacy reasons.
// analytics() below is a no-op placeholder to avoid runtime calls.
/* eslint-enable */

function logger(data) {
  if (debug) document.getElementById('textarea-log').value = data;
}

function analytics(/* data */) {
  // no-op: analytics removed
}

// Chat render helpers
function renderChatMessage(who, text) {
  try {
    const win = document.getElementById('chat-window');
    if (!win) return;
    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble');
    bubble.classList.add(who === 'user' ? 'chat-user' : 'chat-assistant');
    bubble.textContent = text;
    win.appendChild(bubble);
    // keep last ~50 messages visible
    while (win.children.length > 50) win.removeChild(win.children[0]);
    win.scrollTop = win.scrollHeight;
  } catch (e) { console.warn('renderChatMessage failed', e); }
}

const clipboard = new ClipboardJS('#copy');

const copyStatus = (className) => {
  $('#copy').addClass(className);
  setTimeout(() => {
    $('#copy').removeClass(className);
  }, 3000);
};

clipboard.on('success', (e) => {
  copyStatus('copy-ok');
  analytics(['_trackEvent', 'copy', 'ok']);

  e.clearSelection();
});

clipboard.on('error', (e) => {
  copyStatus('copy-fail');
  analytics(['_trackEvent', 'copy', 'nok']);
  if (typeof rcLog !== 'undefined') rcLog('error', 'Clipboard error', e.action, e.trigger);
});

function display(message) {
  if (message && message.message) {
    const field = document.querySelector('#textarea-script');
    field.value = message.message || '';
  }
}

function show(array, visible) {
  array.forEach((id) => {
    const element = document.getElementById(id);
    visible
      ? element.classList.remove('hidden')
      : element.classList.add('hidden');
  });
}

function enable(array, isEnabled) {
  array.forEach((id) => {
    const element = document.getElementById(id);
    isEnabled
      ? element.classList.remove('disabled')
      : element.classList.add('disabled');
  });
}

function toggle(e) {
  logger(e.target.id);

  if (e.target.id === 'record') {
    show(['stop', 'pause', 'pom'], true);
    show(['record', 'resume', 'scan'], false);
    enable(['settings-panel'], false);

    $('#sortable').sortable('disable');
  } else if (e.target.id === 'pause') {
    show(['resume', 'stop', 'pom'], true);
    show(['record', 'scan', 'pause'], false);
    enable(['settings-panel'], false);

    $('#sortable').sortable('disable');
  } else if (e.target.id === 'resume') {
    show(['pause', 'stop', 'pom'], true);
    show(['record', 'scan', 'resume'], false);
    enable(['settings-panel'], false);

    $('#sortable').sortable('disable');
  } else if (e.target.id === 'stop' || e.target.id === 'scan') {
    show(['record', 'scan', 'pom'], true); // add pom?
    show(['resume', 'stop', 'pause'], false);
    enable(['settings-panel'], true);

    $('#sortable').sortable('enable');
  } else if (e.target.id === 'pom') {
    // added so only specific buttons will be available during the POM import
    // show(["record", "scan", "pom"], true);
    // show(["resume", "stop", "pause"], false);
    // enable(["settings-panel"], true);
  } else if (e.target.id === 'settings') {
    analytics(['_trackEvent', 'settings', '⚙️']);
    document.getElementById('settings-panel').classList.toggle('hidden');
  }

  if (e.canSave === false || e.target.id === 'record') {
    document.getElementById('save').disabled = true;
  } else if (
    e.canSave === true
    || e.target.id === 'scan'
    || e.target.id === 'stop'
  ) {
    document.getElementById('save').disabled = false;
  }
  if (e.demo) {
    document.getElementById('demo').checked = e.demo;
  }
  if (e.verify) {
    document.getElementById('verify').checked = e.verify;
  }
}

function busy(e) {
  if (e.isBusy === true || e.isBusy === false) {
    ['scan', 'record', 'stop', 'save', 'save', 'resume'].forEach((id) => {
      document.getElementById(id).disabled = e.isBusy; // add pom?
    });
  }
}

function operation(e) {
  if (e.target.id === 'pom') {
    // Open the lightweight POM helper window (legacy UI)
    window.open($host.runtime.getURL('./src/background.html'), 'pom-helper', 'width=400,height=400');
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
      const popupWindow = window.open(
        $host.runtime.getURL('./src/background.html'),
        'exampleName',
        'width=400,height=400'
      );

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
        locators: []
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
      storage.get({ mqtt_enabled: false, mqtt_broker: {} }, (s) => {
        const st = s.mqtt_enabled ? 'enabled' : 'disabled';
        const url = (s.mqtt_broker && s.mqtt_broker.brokerUrl) ? s.mqtt_broker.brokerUrl : 'no broker';
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

    ['demo', 'verify'].forEach((id) => {
      document.getElementById(id).addEventListener('change', settings);
    });

    // persist share-ui-steps changes when user toggles in popup settings
    const popupShareEl = document.getElementById('share-ui-steps');
    if (popupShareEl) {
      popupShareEl.addEventListener('change', () => {
        try { storage.set({ share_ui_steps: !!popupShareEl.checked }); } catch (e) {}
      });
    }

    document.getElementById('like').addEventListener('click', like);
    document.getElementById('info').addEventListener('click', info);
    document.getElementById('settings').addEventListener('click', toggle);

      // Chat send handler
      const chatSend = document.getElementById('chat-send');
      if (chatSend) {
        chatSend.addEventListener('click', () => {
          const input = document.getElementById('chat-input');
          const respDiv = document.getElementById('chat-response');
          if (!input || !respDiv) return;
          const text = input.value && input.value.trim();
          if (!text) {
            respDiv.textContent = 'Please enter a message';
            return;
          }

          respDiv.textContent = 'Sending...';

              // send chat request to background and await reply
              try {
                // read last context tokenId from storage and include it
                  storage.get({ chat_context: null, share_ui_steps: false }, (s) => {
                    const ctx = s && s.chat_context ? s.chat_context : null;
                    const includeSteps = s && s.share_ui_steps;
                    // when enabled, include the current UI steps as additional context
                    const uiSteps = includeSteps ? (document.getElementById('textarea-script').value || '') : null;
                    const outgoing = { operation: 'chat', input: text, context: ctx, ui_steps: uiSteps };
                  // render user bubble immediately
                  renderChatMessage('user', text);

                  $host.runtime.sendMessage(outgoing, (reply) => {
              const lastErr = $host.runtime && $host.runtime.lastError;
              if (lastErr) {
                let errText = lastErr.message || String(lastErr);
                if (lastErr.stack) errText += `\n${lastErr.stack}`;
                respDiv.textContent = `Chat failed: ${errText}`;
                // request diagnostics from background
                try {
                  $host.runtime.sendMessage({ operation: 'mqtt_status' }, (diagResp) => {
                    if (!diagResp) return;
                    if (diagResp.error) {
                      respDiv.textContent += `\nDiagnostics error: ${diagResp.error}`;
                      return;
                    }
                    const d = diagResp.diagnostics || {};
                    const lines = [];
                    lines.push(`mqtt_enabled=${d.mqtt_enabled}`);
                    lines.push(`brokerUrl=${(d.mqtt_broker && d.mqtt_broker.brokerUrl) || 'none'}`);
                    lines.push(`bridgePresent=${d.bridgePresent}`);
                    lines.push(`clientPresent=${d.clientPresent}`);
                    lines.push(`clientConnected=${d.clientConnected}`);
                    lines.push(`mqttPrefix=${d.mqttPrefix || 'none'}`);
                    respDiv.textContent += `\nDiagnostics:\n${lines.join('\n')}`;
                  });
                } catch (e) {
                  respDiv.textContent += `\nDiagnostics request failed: ${e && e.message ? e.message : e}`;
                }
                return;
              }
              if (!reply) {
                respDiv.textContent = 'No reply received';
                return;
              }
              // reply expected to be { requestId, origin, payload }
              try {
                const rawEl = document.getElementById('chat-raw');
                if (rawEl) {
                  try { rawEl.textContent = JSON.stringify(reply, null, 2); /* keep hidden by default */ } catch (e) { rawEl.textContent = String(reply); }
                }

                // Try to extract a friendly text from the canonical QMS shape: payload.data.reply.text
                let friendly = null;
                if (reply && reply.payload && typeof reply.payload === 'object') {
                  const p = reply.payload;
                  // If backend returned a tokenId to maintain chat context, persist it
                  try {
                    if (p.data && p.data.tokenId) {
                      storage.set({ chat_context: { tokenId: p.data.tokenId, uuid: (reply.uuid || (reply.callback && reply.callback.uuid) || null) } });
                    }
                  } catch (e) {}

                  // Primary: QMS canonical shape
                  if (p.data && p.data.reply && typeof p.data.reply.text === 'string') {
                    friendly = p.data.reply.text;
                  // fallbacks for older/alternate shapes
                  } else if (p.response && typeof p.response === 'string') friendly = p.response;
                  else if (p.reply && typeof p.reply === 'object' && (p.reply.text || p.reply.response)) friendly = p.reply.text || p.reply.response;
                  else if (p.reply && typeof p.reply === 'string') friendly = p.reply;
                  else if (p.responseText && typeof p.responseText === 'string') friendly = p.responseText;
                  else if (p.choices && Array.isArray(p.choices) && p.choices[0] && (p.choices[0].text || p.choices[0].message)) friendly = p.choices[0].text || p.choices[0].message;
                  else if (p.raw && p.raw.text) friendly = p.raw.text;
                }
                if (!friendly && reply && reply.payload && typeof reply.payload === 'string') friendly = reply.payload;
                if (!friendly && reply && reply.response) friendly = reply.response;
                if (!friendly) friendly = '[Received non-text reply — open devtools or enable raw view for details]';

                // render assistant bubble and friendly text
                renderChatMessage('assistant', friendly);
                respDiv.textContent = friendly;
              } catch (e) { respDiv.textContent = String(reply); }
            });
            });
          } catch (e) { respDiv.textContent = `Chat send error: ${e && e.message ? e.message : e}`; }
        });
      }

    $('#sortable').sortable({ update: settings });
    $('#sortable').disableSelection();
  },
  false
);

$host.storage.onChanged.addListener((changes, _) => {
  for (const key in changes) {
    if (key === 'isBusy') busy({ isBusy: changes.isBusy.newValue });
    if (key === 'message') display({ message: changes.message.newValue });
  }
});

$host.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (typeof rcLog !== 'undefined') rcLog('info', 'popup active tab title', tabs[0] && tabs[0].title);
  storage.set({ default_tabs: 'default_tab', tabs, canSave: false });
});
