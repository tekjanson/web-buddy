/* global chrome URL Blob */
/* global instruction filename statusMessage url tab logo translator */

const host = chrome;
const once = {
  once: true
};
let elementState = { state: false };
let list = [];
const libSource = [];
let script;
const storage = host.storage.local;
const content = host.tabs;
// MV3 uses chrome.action; fallback to browserAction for older environments
const icon = host.action || host.browserAction || {
  setIcon: () => {}
};
const maxLength = 5000;
let recordTab = 0;
let demo = false;
let verify = false;

// Helper: get the active tab (or fallback to stored default_tabs) and invoke cb(tab|null)
function getActiveTab(cb) {
  try {
    content.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) return cb(tabs[0]);
      // fallback to stored default tab
      storage.get({ default_tabs: null }, (res) => {
        const bt = res.default_tabs || null;
        return cb(bt);
      });
    });
  } catch (e) {
    console.warn('getActiveTab error', e);
    cb(null);
  }
}

function bgDebug(...args) {
  try {
    if (typeof rcLog !== 'undefined') rcLog('debug', ...args);
  } catch (e) {}
  console.debug('[Robotcorder background]', ...args);
}

// Helper: send a message to a tab object safely and store pending if no receiver
function sendMessageToTabObj(tabObj, message) {
  if (!tabObj || !tabObj.id) {
    console.warn('No tab available to send message', message);
    // persist as pending fallback
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({ message, time: Date.now() });
      storage.set({ pending_messages: arr });
    });
    return;
  }

  try {
    bgDebug('sending to tab', tabObj && tabObj.id, message);
    host.tabs.sendMessage(tabObj.id, message, (resp) => {
      const lastErr = host.runtime && host.runtime.lastError;
      if (lastErr) {
        // no receiver in tab
        const msg = lastErr && lastErr.message ? lastErr.message : String(lastErr);
        console.warn('sendMessage failed:', msg);
        storage.get({ pending_messages: [] }, (s) => {
          const arr = s.pending_messages || [];
          arr.push({
            tabId: tabObj.id, message, time: Date.now(), error: msg
          });
          storage.set({ pending_messages: arr });
        });
      } else {
        bgDebug('message delivered to tab', tabObj.id, 'resp', resp);
      }
    });
  } catch (e) {
    console.warn('sendMessageToTabObj exception', e);
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({
        tabId: tabObj && tabObj.id, message, time: Date.now(), error: String(e)
      });
      storage.set({ pending_messages: arr });
    });
  }
}

// Try a lightweight handshake to ensure the content script is ready before sending the real message.
function sendMessageWithHandshake(tabObj, message, timeout = 300) {
  if (!tabObj || !tabObj.id) {
    console.warn('sendMessageWithHandshake: no tabObj', tabObj, message);
    // fallback to storing pending
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({
        tabId: null, message, time: Date.now(), note: 'no-tab'
      });
      storage.set({ pending_messages: arr });
    });
    return;
  }

  let replied = false;
  let persisted = false; // track if we've already persisted the message to avoid duplicates
  bgDebug('sendMessageWithHandshake start', tabObj && tabObj.id, message);
  try {
    // handshake request
    host.tabs.sendMessage(tabObj.id, { type: 'handshake' }, (resp) => {
      const lastErr = host.runtime && host.runtime.lastError;
      if (lastErr) {
        const msg = lastErr && lastErr.message ? lastErr.message : String(lastErr);
        // Common benign situation: content script not injected / no receiver in that tab/frame.
        // Treat those messages quietly (persist without a loud warning) to reduce noise.
        const benignRe = /Receiving end does not exist|Could not establish connection|The message port closed before a response/;
        if (benignRe.test(msg)) {
          bgDebug('handshake benign', msg, 'for tab', tabObj.id);
          // store pending quietly
          storage.get({ pending_messages: [] }, (s) => {
            const arr = s.pending_messages || [];
            arr.push({ tabId: tabObj.id, message, time: Date.now(), error: msg, handshake: false, benign: true });
            storage.set({ pending_messages: arr });
            persisted = true;
          });
          } else {
          // unexpected error — warn and persist
          console.warn('handshake failed:', msg, 'for tab', tabObj.id);
          bgDebug('handshake unexpected error', msg, 'for tab', tabObj.id);
          storage.get({ pending_messages: [] }, (s) => {
            const arr = s.pending_messages || [];
            arr.push({ tabId: tabObj.id, message, time: Date.now(), error: msg, handshake: false });
            storage.set({ pending_messages: arr });
            persisted = true;
          });
        }
      } else if (resp && resp.pong) {
        replied = true;
        // send actual message now
        sendMessageToTabObj(tabObj, message);
      } else {
        // no explicit error and no pong; persist as pending (these are unexpected)
        console.info('handshake no pong response, storing pending for tab', tabObj.id);
        storage.get({ pending_messages: [] }, (s) => {
          const arr = s.pending_messages || [];
          arr.push({ tabId: tabObj.id, message, time: Date.now(), handshake: false });
          storage.set({ pending_messages: arr });
          persisted = true;
        });
      }
    });
  } catch (e) {
    console.warn('sendMessageWithHandshake exception', e);
    storage.get({ pending_messages: [] }, (s) => {
      const arr = s.pending_messages || [];
      arr.push({ tabId: tabObj.id, message, time: Date.now(), error: String(e) });
      storage.set({ pending_messages: arr });
      persisted = true;
    });
  }

  // safety timeout: if no handshake reply within timeout, persist pending
  setTimeout(() => {
    if (!replied && !persisted) {
      // Only warn/persist on timeout if we haven't already persisted due to an earlier error.
      console.warn('handshake timeout, persisting message for tab', tabObj.id);
      storage.get({ pending_messages: [] }, (s) => {
        const arr = s.pending_messages || [];
        arr.push({ tabId: tabObj.id, message, time: Date.now(), handshake: 'timeout' });
        storage.set({ pending_messages: arr });
      });
    }
  }, timeout);
}

// Helper: resolve an available translator implementation.
function getTranslator() {
  try {
    if (typeof translators !== 'undefined' && translators.robot) return translators.robot;
  } catch (e) {}
  try {
    if (typeof translator !== 'undefined') return translator;
  } catch (e) {}
  try {
    // Node / test environment fallback
    // eslint-disable-next-line global-require
    const tindex = require('./translator/index.js');
    if (tindex && tindex.robot) return tindex.robot;
  } catch (e) {}
  // final fallback: noop translator
  return {
    generateOutput() { return ''; },
    generateFile() { return ''; }
  };
}

storage.set({
  locators: ['for', 'name', 'id', 'title', 'href', 'class'],
  operation: 'stop',
  message: instruction,
  demo: false,
  verify: false,
  canSave: false,
  isBusy: false
});

function selection(item) {
  if (list.length === 0) {
    list.push(item);
    return;
  }

  const prevItem = list[list.length - 1];

  if (Math.abs(item.time - prevItem.time) > 20) {
    list.push(item);
    return;
  }

  if (item.trigger === 'click') {
    return;
  }

  if (item.trigger === 'change' && prevItem.trigger === 'click') {
    list[list.length - 1] = item;
    return;
  }

  list.push(item);
}

host.runtime.onMessage.addListener((request = {}, sender, sendResponse) => {
  // normalize operation safely
  const operation = request.operation;
  bgDebug('runtime message received', { request, senderTab: sender && sender.tab && sender.tab.id });
  if (typeof rcLog !== 'undefined') rcLog('info', 'runtime message operation', operation, 'senderTab', sender && sender.tab && sender.tab.id);

  // fallback storage lookup for previously-known tabs
  let back_tabs = null;
  try {
    storage.get({ default_tabs: 'default_tabs', tabs: {} }, (backup_tab) => {
      try {
        back_tabs = (backup_tab && Array.isArray(backup_tab.tabs) && backup_tab.tabs[0]) ? backup_tab.tabs[0] : null;
      } catch (e) {
        back_tabs = null;
      }
    });
  } catch (e) {
    back_tabs = null;
  }
  // console.log(back_tabs)
  // content.query(tab, (tabs) => {
  //   console.log(tabs)
  // })
  if (operation === 'record') {
    icon.setIcon({ path: logo[operation] }); // sets robot icon

    getActiveTab((tabObj) => {
      if (typeof rcLog !== 'undefined') rcLog('info', 'active tab', tabObj);
      if (tabObj) {
        recordTab = tabObj;
        list = [
          {
            type: 'url',
            path: recordTab.url,
            time: 0,
            trigger: 'record',
            title: recordTab.title
          }
        ];
        sendMessageWithHandshake(tabObj, { operation, locators: request.locators });
      } else if (back_tabs) {
        recordTab = back_tabs;
        list = [
          {
            type: 'url',
            path: recordTab.url,
            time: 0,
            trigger: 'record',
            title: recordTab.title
          }
        ];
        sendMessageWithHandshake(back_tabs, { operation, locators: request.locators });
      } else {
        if (typeof rcLog !== 'undefined') rcLog('warn', 'no tab available for record');
        storage.set({
          locators: ['for', 'name', 'id', 'title', 'href', 'class'],
          operation: 'stop',
          // provide a safe, user-facing message rather than an undefined variable
          message: 'No active tab available to record actions',
          demo: false,
          verify: false,
          canSave: false,
          isBusy: false
        });
      }
    });

    storage.set({
      message: statusMessage[operation],
      operation,
      canSave: false
    });
  } else if (operation === 'pause') {
    icon.setIcon({ path: logo.pause });
    storage.set({ operation: 'pause', canSave: false, isBusy: false });
  } else if (operation === 'pomer') {
    const scripts = request.results;
    const trigger = scripts[0];
    scripts.shift();
    source = scripts.pop();
    if (typeof rcLog !== 'undefined') rcLog('info', 'pomer scripts', scripts, source);
    if (!libSource.includes(source)) {
      libSource.push(source);
    }
    const maker = {
      trigger,
      type: 'pomer',
      arguments: scripts,
      time: new Date().getTime()
    };
    selection(maker);
    icon.setIcon({ path: logo.pause });
    setTimeout(() => {
      icon.setIcon({ path: logo.record });
    }, 1000);
  } else if (operation === 'pomerSelect') {
    elementState = {
      state: true,
      request,
      sender
    };

    // document.addEventListener(
    //   "keydown",
    //   (event) => {
    //     console.log(event)
    //     if (event.key === "h") {
    //       // case sensitive

    //       document.addEventListener(
    //         "mousemove",
    //         (event) => {
    //           console.log(event);

    //         },
    //         once
    //       );
    //     }
    //   },
    //   once
    // );
  } else if (operation === 'resume') {
    operation = 'record';

    icon.setIcon({ path: logo[operation] });

    getActiveTab((tabObj) => {
      const t = tabObj || back_tabs;
      if (t) sendMessageWithHandshake(t, { operation, locators: request.locators });
    });

    storage.set({
      message: statusMessage[operation],
      operation,
      canSave: false
    });
  } else if (operation === 'scan') {
    icon.setIcon({ path: logo.action });

    getActiveTab((tabObj) => {
      const t = tabObj || back_tabs;
      if (t) {
        recordTab = t;
        list = [
          {
            type: 'url',
            path: recordTab.url,
            time: 0,
            trigger: 'scan',
            title: recordTab.title
          }
        ];
        sendMessageWithHandshake(t, { operation, locators: request.locators });
      }
    });

    storage.set({
      message: statusMessage[operation],
      operation: 'scan',
      canSave: true,
      isBusy: true
    });
  } else if (operation === 'stop') {
    recordTab = 0;
    icon.setIcon({ path: logo[operation] });

    script = getTranslator().generateOutput(list, maxLength, demo, verify);
    getActiveTab((tabObj) => {
      const t = tabObj || back_tabs;
      if (t) sendMessageWithHandshake(t, { operation: 'stop' });
    });

    storage.set({ message: script, operation, canSave: true });
  } else if (operation === 'save') {
    const file = getTranslator().generateFile(list, maxLength, demo, verify, libSource);
    const blob = new Blob([file], { type: 'text/plain;charset=utf-8' });

    // MV3 service worker may run in contexts where URL.createObjectURL or
    // chrome.downloads is unavailable. Try to download, otherwise store
    // the file body in storage as a fallback so the popup/options can offer it.
    try {
      if (typeof URL !== 'undefined' && host.downloads && host.downloads.download) {
        host.downloads.download({
          url: URL.createObjectURL(blob, { oneTimeOnly: true }),
          filename
        });
      } else {
        throw new Error('downloads API or URL unavailable');
      }
    } catch (e) {
      // fallback: persist the file text to storage for retrieval by UI
      const fileText = file;
      storage.set({ last_file: { filename, body: fileText, time: Date.now() } });
    }
  } else if (operation == 'pom') {
    // if the button is pom
    storage.set({
      message: statusMessage[operation],
      operation,
      canSave: false
    });
  } else if (operation === 'settings') {
    ({ demo, verify } = request);

    storage.set({ locators: request.locators, demo, verify });
  } else if (operation === 'load') {
    storage.get({ operation: 'stop', locators: [] }, (state) => {
      // sender.tab may be undefined if called from service worker context
      const target = (sender && sender.tab) ? sender.tab : null;
      if (target) sendMessageToTabObj(target, { operation: state.operation, locators: state.locators });
      else console.warn('No sender.tab available to respond to load request');
    });
  } else if (operation === 'info') {
    host.tabs.create({ url });
  } else if (operation === 'action') {
    bgDebug('received action message', request);
    if (elementState.state === true) {
      elementState.state = false;
      icon.setIcon({ path: logo.pause });
      setTimeout(() => {
        icon.setIcon({ path: logo.record });
      }, 1000);
      content.sendMessage(elementState.sender.tab.id, {
        msg: 'element',
        data: {
          request,
          elementState
        }
      });
      request.script = null;
    }

    if (request.script) {
      bgDebug('received single script', request.script);
      selection(request.script);
      icon.setIcon({ path: logo[operation] });
      setTimeout(() => {
        icon.setIcon({ path: logo.record });
      }, 1000);
    }

    if (request.scripts) {
      bgDebug('received scripts array, count', request.scripts && request.scripts.length);
      icon.setIcon({ path: logo.stop });
      list = list.concat(request.scripts || []);
      bgDebug('list length after concat', list.length);
      script = getTranslator().generateOutput(list, maxLength, demo, verify);

      storage.set({ message: script, operation: 'stop', isBusy: false });
    }
  } else if (operation === 'execute') {
    // incoming execution request (from MQTT mediator). Background mediates all execution.
    // request.command -> { action, path, value, id }
    const cmd = request.command || {};
    storage.get({ execution_policy: { mode: 'suggestion', allowed_actions: ['click', 'navigate', 'input'], per_test_type: {} } }, (state) => {
      const policy = state.execution_policy || { mode: 'suggestion', allowed_actions: ['click', 'navigate', 'input'], per_test_type: {} };
      const ttype = request.test_type || 'functional';
      const allowed = (policy.allowed_actions || []).includes(cmd.action);
      const modeForType = (policy.per_test_type && policy.per_test_type[ttype]) || policy.mode || 'suggestion';

      if (modeForType === 'automatic' && allowed) {
        // forward to active tab
        content.query(tab, (tabs) => {
          if (tabs && tabs[0]) {
            content.sendMessage(tabs[0].id, { operation: 'execute', command: cmd });
          }
        });
        // acknowledge via storage (background may publish this via MQTT bridge)
        const ack = {
          status: 'executed', id: cmd.id || null, time: Date.now(), command: cmd
        };
        // append to actions log
        storage.get({ actions_log: [] }, (s2) => {
          const log = s2.actions_log || [];
          log.push(ack);
          storage.set({ actions_log: log });
        });
      } else {
        // save suggestion for UI review
        storage.get({ suggestions: [] }, (s) => {
          const suggestions = s.suggestions || [];
          suggestions.push({ id: request.id || `sugg-${Date.now()}`, time: Date.now(), request });
          storage.set({ suggestions });
        });
      }
    });
  }
});
