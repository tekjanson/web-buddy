/* eslint-disable no-undef */
const { expect } = require('chai');

describe('content script recording (e2e-ish)', () => {
  let sentMessages = [];

  beforeEach(() => {
    // Reset and stub chrome.runtime.sendMessage to capture messages
    sentMessages = [];
    global.chrome.runtime.sendMessage = function (msg, cb) {
      sentMessages.push(msg);
      if (typeof cb === 'function') cb({ ok: true });
    };
    // Allow the test to capture the onMessage listener added by content.js
    global._content_onMessage = null;
    global.chrome.runtime.onMessage = { addListener: (cb) => { global._content_onMessage = cb; } };
  });

  it('captures clicks and inputs and forwards as action messages', (done) => {
    // Load the content script module into the test env
    // require will execute src/content.js which attaches listeners
    // We wrap require in a try to ensure re-execution
    try { delete require.cache[require.resolve('../src/content.js')]; } catch (e) {}
    // Prepare DOM: add an input and a button
    const input = document.createElement('input'); input.id = 'test-input'; document.body.appendChild(input);
    const btn = document.createElement('button'); btn.id = 'test-btn'; btn.textContent = 'ClickMe'; document.body.appendChild(btn);

    // Provide a minimal scanner stub so content.js can parse nodes in this test env
    global.scanner = {
      parseNode: () => ({ type: 'text', path: '/html/body/input[1]', value: 'typed text' }),
      parseNodes: () => []
    };

    // Execute content script
    require('../src/content.js');

    // Tell content script to start recording by invoking its onMessage listener
    if (typeof global._content_onMessage === 'function') {
      try { global._content_onMessage({ operation: 'record', locators: [] }, { tab: { id: 1 } }, () => {}); } catch (e) {}
    }

    // Simulate input event
    input.value = 'typed text';
    // Create events using the jsdom window constructors to avoid cross-window event type issues
    let inputEvent;
    if (typeof window.Event === 'function') {
      inputEvent = new window.Event('input', { bubbles: true });
    } else {
      inputEvent = document.createEvent('Event'); inputEvent.initEvent('input', true, false);
    }
    input.dispatchEvent(inputEvent);

    // Simulate click event (use element.click() to be robust)
    if (typeof btn.click === 'function') btn.click();
    else {
      let clickEvent;
      if (typeof window.MouseEvent === 'function') clickEvent = new window.MouseEvent('click', { bubbles: true });
      else { clickEvent = document.createEvent('MouseEvent'); clickEvent.initEvent('click', true, false); }
      btn.dispatchEvent(clickEvent);
    }

    // Allow async handlers to run
    setTimeout(() => {
      try {
        // We should have at least one 'action' message (content.sendAction) plus the initial 'attached' message
        const actionMsgs = sentMessages.filter(m => m && (m.operation === 'action' || m.script || m.scripts));
        expect(actionMsgs.length).to.be.at.least(1);
        // Ensure one of the action messages contains a value (from the input stub)
        const hasValue = actionMsgs.some((m) => {
          return (
            (m.script && (m.script.value || m.script.trigger))
            || (m.scripts && m.scripts.length > 0)
          );
        });
        expect(hasValue).to.equal(true);
        done();
      } catch (err) { done(err); }
    }, 80);
  });
});
