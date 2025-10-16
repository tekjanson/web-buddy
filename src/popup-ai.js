/* popup-ai.js — AI Assist flow with page summary and preview
   Single clean implementation. Exposes:
     window._wb_initAiAssist() and window._wb_extractJsonFromText(txt)
*/
(function () {
  'use strict';

  // Robust JSON extraction from text (fenced JSON, fenced block, or first JSON-like block)
  function extractJsonFromText(txt) {
    if (!txt) return null;
    try {
      const fenceJson = txt.match(/```json\s*([\s\S]*?)\s*```/i);
      if (fenceJson && fenceJson[1]) return fenceJson[1].trim();

      const fenceAny = txt.match(/```\s*([\s\S]*?)\s*```/i);
      if (fenceAny && fenceAny[1]) {
        const inner = fenceAny[1].trim();
        const m = inner.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (m) return (m[0] || inner).trim();
        return inner;
      }

      const m = txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (m) return m[0];
      return null;
    } catch (e) {
      return null;
    }
  }

  // Unified logging: write to popup response element and console.
  function logToUI(respDiv, msg, level) {
    try {
      const el = respDiv || document.getElementById('chat-response');
      const now = new Date().toLocaleTimeString();
      const prefix = `[${now}] `;
      if (el) {
        // Append message to existing content to preserve history
        try {
          const prev = el.textContent || '';
          el.textContent = (prev ? prev + '\n' : '') + prefix + msg;
        } catch (e) {
          try { el.value = (el.value ? el.value + '\n' : '') + prefix + msg; } catch (ee) {}
        }
      }
    } catch (e) { /* ignore UI logging errors */ }
    try {
      if (level === 'error' && console && console.error) console.error('popup-ai:', msg);
      else if (level === 'warn' && console && console.warn) console.warn('popup-ai:', msg);
      else if (console && console.debug) console.debug('popup-ai:', msg);
      else console.log('popup-ai:', msg);
    } catch (e) { /* ignore console errors */ }
  }

  // Render a readable, multi-line preview of the outgoing prompt near the
  // response area. Split style assignments and long strings so no line exceeds
  // 100 characters.
  function showPromptPreview(respDiv, text) {
    try {
      const container = respDiv || document.getElementById('chat-response') || null;
      // remove existing preview
      const existing = document.getElementById('ai-prompt-preview');
      if (existing) existing.remove();

      const wrapper = document.createElement('div');
      wrapper.id = 'ai-prompt-preview';
      wrapper.style.marginTop = '8px';
      wrapper.style.padding = '8px';
      wrapper.style.border = '1px solid #eee';
      wrapper.style.background = '#f7f7f7';
      wrapper.style.fontFamily = 'monospace';
      wrapper.style.fontSize = '12px';
      wrapper.style.whiteSpace = 'pre-wrap';
      wrapper.style.maxHeight = '240px';
      wrapper.style.overflow = 'auto';

      const hdr = document.createElement('div');
      hdr.textContent = 'Outgoing prompt (preview):';
      hdr.style.fontWeight = '600';
      hdr.style.marginBottom = '6px';
      wrapper.appendChild(hdr);

      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.margin = '0';
      pre.textContent = text;
      wrapper.appendChild(pre);

      const btnBar = document.createElement('div');
      btnBar.style.marginTop = '6px';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn';
      copyBtn.textContent = 'Copy prompt';
      copyBtn.style.marginRight = '6px';
      copyBtn.addEventListener('click', () => {
        try {
          navigator.clipboard.writeText(text);
          logToUI(respDiv, 'Prompt copied to clipboard', 'debug');
        } catch (e) {
          logToUI(respDiv, 'Failed to copy prompt to clipboard', 'warn');
        }
      });

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => {
        const el = document.getElementById('ai-prompt-preview');
        if (el) el.remove();
      });

      btnBar.appendChild(copyBtn);
      btnBar.appendChild(closeBtn);
      wrapper.appendChild(btnBar);

      if (container && container.parentNode) {
        if (container.nextSibling) {
          container.parentNode.insertBefore(wrapper, container.nextSibling);
        } else {
          container.parentNode.appendChild(wrapper);
        }
      } else {
        document.body.appendChild(wrapper);
      }
    } catch (e) { /* ignore */ }
  }

  // Return true only for http/https pages that allow content script injection.
  function tabIsInjectable(tab) {
    try {
      if (!tab || !tab.url) return false;
      // Only allow http(s) pages; chrome://, about:, file:, chrome-extension://, and webstore pages are restricted
      var u = new URL(tab.url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  // Try to request host permission for the current tab's origin (if the
  // browser supports it). Logs progress to UI. originPattern will be like
  // 'https://example.com/*'.
  function tryHostPermissionRequest(tab, respDiv) {
    try {
      // If caller didn't provide a tab or it lacks a URL, try to obtain one
      // via getTargetTab.
      if (!tab || !tab.url) {
        return getTargetTab((t) => { tryHostPermissionRequest(t, respDiv); });
      }

      if (!$host.permissions || !$host.permissions.request) {
        logToUI(respDiv,
          'Host permission request API unavailable in this browser', 'warn');
        return;
      }

      var u = null;
      try { u = new URL(tab.url); } catch (e) {
        logToUI(respDiv, 'Cannot parse tab URL for permission request', 'warn');
        return;
      }

      var originPattern = u.origin + '/*';
      // Only http/https origins can be requested via permissions.request
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        logToUI(respDiv,
          'Host permission cannot be requested for protocol ' + u.protocol + ' (URL: ' + tab.url + ')',
          'warn');
        return;
      }

      logToUI(respDiv, 'Requesting host permission for ' + u.origin + '...', 'debug');
      $host.permissions.request({ origins: [originPattern] }, function (granted) {
        try {
          const le = $host.runtime && $host.runtime.lastError;
          if (le) {
            logToUI(respDiv, 'Permission request error: ' + (le.message || String(le)), 'error');
            return;
          }
          if (granted) {
            logToUI(respDiv, 'Permission granted for host. Try the action again.', 'debug');
          } else {
            logToUI(respDiv, 'Permission was not granted by the user.', 'warn');
          }
        } catch (e2) {
          logToUI(respDiv,
            'Permission callback error: ' + (e2 && e2.message ? e2.message : e2), 'error');
        }
      });
    } catch (e) {
      logToUI(respDiv, 'Host permission request failed: ' + (e && e.message ? e.message : e), 'error');
    }
  }

  // Create and show an editable preview panel for actions
  function showActionsPreview(actions, originalText, respDiv) {
    // remove existing preview
    const existing = document.getElementById('ai-actions-preview');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'ai-actions-preview';
    panel.className = 'ai-preview';
    panel.style.cssText = 'padding:8px;border:1px solid #ddd;background:#fff;max-height:360px;overflow:auto;margin-top:8px;';

    const title = document.createElement('div');
    title.textContent = `AI suggested ${actions.length} action(s):`;
    title.style.fontWeight = '600';
    panel.appendChild(title);

    const list = document.createElement('ol');
    list.style.margin = '8px 0 8px 18px';
    actions.forEach((a) => {
      const li = document.createElement('li');
      const sel = a.selector || a.select || a.xpath || '';
      li.textContent = `${a.action || '(unknown)'} — selector: ${sel || '(none)'}${a.value ? ' — value: ' + String(a.value) : ''}`;
      if (!sel) li.style.color = '#b45f06';
      list.appendChild(li);
    });
    panel.appendChild(list);

    const jsonLabel = document.createElement('div');
    jsonLabel.textContent = 'Actions JSON (editable):';
    jsonLabel.style.marginTop = '6px';
    panel.appendChild(jsonLabel);

    const ta = document.createElement('textarea');
    ta.id = 'ai-json-edit';
    ta.style.width = '100%';
    ta.style.height = '140px';
    ta.value = JSON.stringify(actions, null, 2);
    panel.appendChild(ta);

    const btnBar = document.createElement('div');
    btnBar.style.marginTop = '6px';

  const makeBtn = (txt) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = txt; b.style.marginRight = '6px'; return b; };
    const execBtn = makeBtn('Execute');
    const cancelBtn = makeBtn('Cancel');
    const reformatBtn = makeBtn('Ask AI to return JSON only');
    const tryGoalBtn = makeBtn('Retry with goal');
    const highlightBtn = makeBtn('Highlight First Selector');
    const clearHighlightBtn = makeBtn('Clear Highlight');
  const closeBtn = makeBtn('Close');

    btnBar.appendChild(execBtn);
    btnBar.appendChild(cancelBtn);
    btnBar.appendChild(reformatBtn);
    btnBar.appendChild(tryGoalBtn);
    btnBar.appendChild(highlightBtn);
    btnBar.appendChild(clearHighlightBtn);
  btnBar.appendChild(closeBtn);
    panel.appendChild(btnBar);

    // Place the preview next to the chat-response element (as a sibling) so
    // that calls which reset `textContent` on the response container do not
    // remove the preview DOM. Fall back to appending to document.body.
    const resp = respDiv || document.getElementById('chat-response') || null;
    if (resp && resp.parentNode) {
      // Insert after resp element
      if (resp.nextSibling) resp.parentNode.insertBefore(panel, resp.nextSibling);
      else resp.parentNode.appendChild(panel);
    } else {
      // No chat-response container available; append to body
      document.body.appendChild(panel);
    }

    execBtn.addEventListener('click', () => {
      let parsed = null;
      try { parsed = JSON.parse(ta.value); } catch (e) { alert('Invalid JSON: ' + e.message); return; }
      if (!Array.isArray(parsed) || parsed.length === 0) { alert('No actions to execute'); return; }
      const commands = parsed.map((a) => {
        const selector = a.selector || a.select || a.xpath || '';
        const selector_type = a.selector_type || (selector && selector.indexOf('//') === 0 ? 'xpath' : 'css');
        const value = a.value || a.text || a.input || null;
        return {
          action: a.action,
          selector,
          selector_type,
          value,
          retries: a.retries || 3
        };
      });
      logToUI(respDiv, 'Sending actions for execution...', 'debug');
      try {
        $host.runtime.sendMessage({ operation: 'run_translated', commands }, (r) => {
          const le = $host.runtime && $host.runtime.lastError;
          if (le) {
            logToUI(respDiv, `Execution error: ${le.message}`, 'error');
          } else {
            logToUI(respDiv, 'AI actions sent for execution', 'debug');
          }
          // Keep the preview open so the user can continue interacting (highlight, reformat, etc.).
        });
      } catch (e) { logToUI(respDiv, `Execution failed: ${e && e.message ? e.message : e}`, 'error'); }
    });

  cancelBtn.addEventListener('click', () => {
    const p = document.getElementById('ai-actions-preview');
    if (p) p.remove();
    logToUI(respDiv, 'Execution cancelled by user', 'debug');
  });
  closeBtn.addEventListener('click', () => {
    const p = document.getElementById('ai-actions-preview');
    if (p) p.remove();
    logToUI(respDiv, 'Preview closed', 'debug');
  });

    reformatBtn.addEventListener('click', () => {
      logToUI(respDiv, 'Requesting reformat (JSON-only) from AI...', 'debug');
      const reformatParts = [
        'Please convert the following assistant reply into a valid JSON array of actions only',
        '(no explanation). If no actions, return []. Reply with only JSON.',
        'Reply to the following text:',
        '',
        originalText
      ];
      const reformatInstruction = reformatParts.join('\n');
      try {
        $host.runtime.sendMessage({ operation: 'chat', input: reformatInstruction }, (rep2) => {
          const lastErr = $host.runtime && $host.runtime.lastError;
          if (lastErr) { logToUI(respDiv, `Reformat failed: ${lastErr.message || String(lastErr)}`, 'error'); return; }
          let t2 = null;
          try {
            if (
              rep2 && rep2.payload && rep2.payload.data && rep2.payload.data.reply
              && rep2.payload.data.reply.text
            ) {
              t2 = rep2.payload.data.reply.text;
            }
          } catch (e) {}

          if (!t2 && rep2 && typeof rep2.payload === 'string') {
            t2 = rep2.payload;
          }
          if (!t2 && rep2 && rep2.payload && rep2.payload.reply) {
            t2 = rep2.payload.reply;
          }
          if (!t2) { logToUI(respDiv, 'Reformat did not return text', 'warn'); return; }
          const jt = extractJsonFromText(t2);
          if (!jt) { logToUI(respDiv, 'Reformat attempt did not produce JSON', 'warn'); return; }
          let acts = null;
          try {
            acts = JSON.parse(jt);
          } catch (e) {
            logToUI(respDiv, 'Failed to parse reformatted JSON: ' + e.message, 'error');
            return;
          }
          if (!Array.isArray(acts) || acts.length === 0) { logToUI(respDiv, 'Reformat returned no actions', 'warn'); return; }
          ta.value = JSON.stringify(acts, null, 2);
          // refresh list display
          const old = panel.querySelector('ol'); if (old) old.remove();
          const ol2 = document.createElement('ol');
          ol2.style.margin = '8px 0 8px 18px';
          acts.forEach((a) => {
            const li = document.createElement('li');
            const sel = a.selector || a.select || a.xpath || '';
            li.textContent = (a.action || '(unknown)') + ' — selector: ' + (sel || '(none)') + (a.value ? ' — value: ' + String(a.value) : '');
            if (!sel) li.style.color = '#b45f06';
            ol2.appendChild(li);
          });
          panel.insertBefore(ol2, jsonLabel);
          logToUI(respDiv, `Reformat returned ${acts.length} actions`, 'debug');
        });
      } catch (e) { logToUI(respDiv, `Reformat request failed: ${e && e.message ? e.message : e}`, 'error'); }
    });

    tryGoalBtn.addEventListener('click', () => {
      const g = prompt('Describe the goal for the AI (e.g. "log in", "add item to cart"). Leave empty to cancel.');
      if (!g) return; logToUI(respDiv, 'Retrying with your goal...', 'debug');
      const ev = new CustomEvent('wb_ai_retry_with_goal', { detail: { goal: g } }); document.dispatchEvent(ev);
    });

  highlightBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(ta.value);
        if (!Array.isArray(parsed) || parsed.length === 0) { alert('No actions to highlight'); return; }
        const first = parsed[0];
        const sel = first.selector || first.select || first.xpath || '';
        const selType = first.selector_type || (sel && sel.indexOf('//') === 0 ? 'xpath' : 'css');
        getTargetTab((tab) => {
          if (!tab || !tab.id) { alert('No active tab to highlight'); return; }
          const tabId = tab.id;
          if (!tabIsInjectable(tab)) {
              explainInjectionBlocked(tab, respDiv, 'Cannot inject content script: page is not accessible (e.g. internal or webstore page).');
              tryHostPermissionRequest(tab, respDiv);
              return;
            }
          const injectAndSend = () => {
            try {
              $host.tabs.sendMessage(tabId, { operation: 'highlight', selector: sel, selector_type: selType, textFallback: first.textFallback || null }, (r) => {
                const le = $host.runtime && $host.runtime.lastError;
                if (le) {
                  // If message failed because content script isn't present, surface a friendly message
                  logToUI(respDiv, `Highlight failed: ${le.message || String(le)}`, 'error');
                  return;
                }

                const statusText = r && r.status ? r.status : 'unknown';
                logToUI(respDiv, `Highlight: ${statusText}`, 'debug');

                // If not found, but suggestions were returned, render suggestion buttons
                if (r && r.status === 'not_found' && Array.isArray(r.suggestions) && r.suggestions.length) {
                  let sugDiv = panel.querySelector('.ai-suggestions');
                  if (sugDiv) sugDiv.remove();
                  sugDiv = document.createElement('div');
                  sugDiv.className = 'ai-suggestions';
                  sugDiv.style.marginTop = '8px';
                  const h = document.createElement('div'); h.textContent = 'No exact match found. Suggested alternative targets:'; h.style.fontWeight = '600'; sugDiv.appendChild(h);
                  const ul = document.createElement('ul'); ul.style.margin = '6px 0 0 18px';
                  r.suggestions.forEach((s, idx) => {
                    const li = document.createElement('li'); li.style.marginBottom = '6px';
                    const desc = document.createElement('span');
                    let label = '';
                    if (s.selector) label = `CSS: ${s.selector}`;
                    else if (s.xpath) label = `XPath: ${s.xpath}`;
                    else label = s.text ? `Text contains: "${String(s.text).slice(0, 60)}"` : 'candidate';
                    desc.textContent = label;
                    li.appendChild(desc);
                    const useBtn = document.createElement('button'); useBtn.className = 'btn'; useBtn.textContent = 'Use'; useBtn.style.marginLeft = '8px';
                    useBtn.addEventListener('click', () => {
                      // apply suggestion to the first action in the editable JSON
                      try {
                        const cur = JSON.parse(ta.value);
                        if (!Array.isArray(cur) || cur.length === 0) { alert('No actions to update'); return; }
                        const firstAction = cur[0];
                        if (s.selector) {
                          firstAction.selector = s.selector;
                          firstAction.selector_type = 'css';
                          delete firstAction.xpath;
                        } else if (s.xpath) {
                          firstAction.selector = s.xpath;
                          firstAction.selector_type = 'xpath';
                        }
                        if (s.text && (!firstAction.textFallback ||
                          firstAction.textFallback !== s.text)) {
                          firstAction.textFallback = s.text;
                        }
                        ta.value = JSON.stringify(cur, null, 2);
                        // retry highlight by clicking the highlight button
                        highlightBtn.click();
                      } catch (ee) { alert('Failed to apply suggestion: ' + (ee && ee.message ? ee.message : ee)); }
                    });
                    li.appendChild(useBtn);
                    ul.appendChild(li);
                  });
                  sugDiv.appendChild(ul);
                  panel.appendChild(sugDiv);
                }
              });
        } catch (e) { logToUI(respDiv, `Highlight request failed: ${e && e.message ? e.message : e}`, 'error'); }
          };

          // Inject content script using MV3 scripting.executeScript only. Do not silently fallback.
          try {
            if ($host.scripting && $host.scripting.executeScript) {
              $host.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] }, () => {
                const le = $host.runtime && $host.runtime.lastError;
                if (le) {
                  // If injection failed due to host permission, surface friendly guidance
                  logToUI(respDiv, `Failed to inject content script: ${le.message || String(le)}`, 'error');
                  tryHostPermissionRequest(tab, respDiv);
                  return;
                }
                injectAndSend();
              });
            } else {
              logToUI(respDiv, 'Cannot inject content script: MV3 scripting.executeScript API is unavailable. Highlight aborted.', 'error');
            }
          } catch (e) {
            logToUI(respDiv, `Highlight injection error: ${e && e.message ? e.message : e}`, 'error');
          }
        });
      } catch (e) { alert('Invalid JSON in actions'); }
    });

    clearHighlightBtn.addEventListener('click', () => { getTargetTab((tab) => {
      if (!tab || !tab.id) { alert('No active tab to clear highlight'); return; }
      const tabId = tab.id;
      if (!tabIsInjectable(tab)) {
        explainInjectionBlocked(tab, respDiv);
        tryHostPermissionRequest(tab, respDiv);
        return;
      }
      const doClear = () => {
        try { $host.tabs.sendMessage(tabId, { operation: 'clear_highlight' }, (r) => { const respText = r && r.status ? r.status : 'unknown'; logToUI(respDiv, `Clear highlight: ${respText}`, 'debug'); }); } catch (e) { logToUI(respDiv, `Clear highlight request failed: ${e && e.message ? e.message : e}`, 'error'); }
      };
      try {
        if ($host.scripting && $host.scripting.executeScript) {
          $host.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] }, () => {
            const le = $host.runtime && $host.runtime.lastError;
            if (le) {
              logToUI(respDiv, `Failed to inject content script for clear: ${le.message || String(le)}`, 'error');
              tryHostPermissionRequest(tab, respDiv);
              return;
            }
            doClear();
          });
        } else {
          logToUI(respDiv, 'Cannot inject content script: MV3 scripting.executeScript API is unavailable. Clear highlight aborted.', 'error');
        }
      } catch (e) { logToUI(respDiv, `Clear highlight injection error: ${e && e.message ? e.message : e}`, 'error'); }
    }); });

    return panel;
  }

  // Explain why injection was blocked and surface actionable UI/diagnostics
  function explainInjectionBlocked(tab, respDiv, shortMsg) {
    try {
      const url = (tab && tab.url) ? tab.url : '(no url)';
      let proto = 'unknown';
      try { proto = tab && tab.url ? new URL(tab.url).protocol : 'unknown'; } catch (e) {}
      const base = shortMsg || 'Cannot inject content script into this page.';
      logToUI(respDiv, `${base} URL: ${url} — protocol: ${proto}`, 'error');

      // If it's a file: URL, instruct user about file access setting
      if (proto === 'file:') {
        logToUI(respDiv, 'This is a file:// URL. Enable "Allow access to file URLs" for the extension on the extensions management page, or host the file over http(s).', 'warn');
        return;
      }

      // If it's not http(s), explain it's a browser-internal or restricted page
      if (proto !== 'http:' && proto !== 'https:') {
        logToUI(respDiv, 'Pages with this protocol are restricted (example: chrome:// or extension pages) and do not allow content script injection.', 'warn');
        return;
      }

      // For http(s) pages, suggest requesting host permission
      logToUI(respDiv, 'This looks like an http(s) page. You may need to grant host permission for this site. Click "Request access" in the popup if available.', 'debug');
    } catch (e) { /* ignore */ }
  }

  // Main initializer: wire AI assist button and retry-with-goal event
  function initAiAssist() {
    const aiBtn = document.getElementById('ai-assist');
    if (!aiBtn) return;

    // Event for retrying with a user-specified goal
    document.addEventListener('wb_ai_retry_with_goal', (ev) => {
      const goal = ev && ev.detail && ev.detail.goal;
      if (!goal) return;
      const respEl = document.getElementById('chat-response'); logToUI(respEl, 'Retrying with your goal...', 'debug');

      // Mirror the main AI flow: include chat_context and ui_steps so the retry gets full context
      try {
        storage.get({ chat_context: null, share_ui_steps: false }, (s) => {
          const ctx = s && s.chat_context ? s.chat_context : null;
          const includeSteps = s && s.share_ui_steps;
          const uiSteps = includeSteps ? (document.getElementById('textarea-script') && document.getElementById('textarea-script').value ? document.getElementById('textarea-script').value : '') : '';

          // request the page html and proceed, but first ensure content script is injected (MV3 only)
          getTargetTab((t) => {
            if (!t || !t.id) { sendAssist(null, goal, null, ctx, uiSteps, respEl); return; }
            const tabId = t.id;
            // If the page is not a normal http(s) origin, avoid attempting injection and offer to request permission
            if (!tabIsInjectable(t)) {
              const msg = 'Cannot inject content script: page is not accessible (e.g. internal or webstore page).';
              logToUI(respEl, msg, 'error');
              tryHostPermissionRequest(t, respEl);
              return;
            }
            if ($host.scripting && $host.scripting.executeScript) {
              try {
                logToUI(respEl, 'Ensuring content script is injected...', 'debug');
                console.debug('popup-ai: injecting content script into tab', tabId);
                $host.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] }, () => {
                  const le = $host.runtime && $host.runtime.lastError;
                  if (le) {
                    const msg = `Failed to inject content script: ${le.message || String(le)}`;
                    logToUI(respEl, msg, 'error');
                    console.debug('popup-ai:', msg, le);
                    tryHostPermissionRequest(t, respEl);
                    return;
                  }
                  // Now request page HTML
                  try {
                    logToUI(respEl, 'Requesting page HTML...', 'debug');
                    $host.tabs.sendMessage(tabId, { operation: 'get_page_html' }, (resp) => {
                      const le2 = $host.runtime && $host.runtime.lastError;
                      if (le2) {
                        const msg2 = `Could not get page HTML: ${le2.message || String(le2)}`;
                        logToUI(respEl, msg2, 'error');
                        console.debug('popup-ai:', msg2, le2);
                        return;
                      }
                      sendAssist(
                        resp && resp.html ? resp.html : null,
                        goal,
                        t,
                        ctx,
                        uiSteps,
                        respEl
                      );
                    });
                  } catch (e) {
                    const msg3 = `Error requesting page HTML: ${e && e.message ? e.message : e}`;
                    logToUI(respEl, msg3, 'error');
                    console.debug('popup-ai:', msg3, e);
                  }
                });
              } catch (e) {
                const msg = `Injection error: ${e && e.message ? e.message : e}`;
                logToUI(respEl, msg, 'error');
                console.debug('popup-ai:', msg, e);
              }
            } else {
              const msg = 'Cannot inject content script: MV3 scripting.executeScript API is unavailable. Retry aborted.';
              logToUI(respEl, msg, 'error');
              console.debug('popup-ai:', msg);
            }
          });
        });
      } catch (e) { logToUI(respEl, `Retry-with-goal error: ${e && e.message ? e.message : e}`, 'error'); }
    });

    aiBtn.addEventListener('click', (ev) => {
      // Prevent clicks from bubbling to other handlers and avoid default behavior
      try { ev && ev.preventDefault && ev.preventDefault(); } catch (e) {}
      try { ev && ev.stopPropagation && ev.stopPropagation(); } catch (e) {}
      const respDiv = document.getElementById('chat-response'); logToUI(respDiv, 'Requesting AI suggestions...', 'debug');
      try {
        storage.get({ chat_context: null, share_ui_steps: false }, (s) => {
          const ctx = s && s.chat_context ? s.chat_context : null;
          const includeSteps = s && s.share_ui_steps;
          const uiSteps = includeSteps ? (document.getElementById('textarea-script') && document.getElementById('textarea-script').value ? document.getElementById('textarea-script').value : '') : '';

          getTargetTab((t) => {
            if (!t || !t.id) { sendAssist(null, null, null, ctx, uiSteps, respDiv); return; }
            const tabId = t.id;
            // Inject content script first (MV3 only) to ensure messaging listener exists
            // Don't attempt injection on internal or restricted pages
            if (!tabIsInjectable(t)) {
              explainInjectionBlocked(t, respDiv);
              tryHostPermissionRequest(t, respDiv);
              return;
            }
            if ($host.scripting && $host.scripting.executeScript) {
              try {
                logToUI(respDiv, 'Ensuring content script is injected...', 'debug');
                $host.scripting.executeScript({ target: { tabId }, files: ['src/content.js'] }, () => {
                  const le = $host.runtime && $host.runtime.lastError;
                  if (le) { logToUI(respDiv, `Failed to inject content script: ${le.message || String(le)}`, 'error'); tryHostPermissionRequest(t, respDiv); return; }
                  try {
                    logToUI(respDiv, 'Requesting page HTML...', 'debug');
                    $host.tabs.sendMessage(tabId, { operation: 'get_page_html' }, (resp) => {
                      const lastErr = $host.runtime && $host.runtime.lastError;
                      if (lastErr) { logToUI(respDiv, `Could not get page HTML: ${lastErr.message || String(lastErr)}`, 'error'); return; }
                      sendAssist(
                        resp && resp.html ? resp.html : null,
                        null,
                        t,
                        ctx,
                        uiSteps,
                        respDiv
                      );
                    });
                  } catch (e) { logToUI(respDiv, `Error requesting page HTML: ${e && e.message ? e.message : e}`, 'error'); }
                });
              } catch (e) { logToUI(respDiv, `Injection error: ${e && e.message ? e.message : e}`, 'error'); }
            } else {
              logToUI(respDiv, 'Cannot inject content script: MV3 scripting.executeScript API is unavailable. Aborting AI request.', 'error');
            }
          });
        });
      } catch (e) { logToUI(respDiv, `AI assist error: ${e && e.message ? e.message : e}`, 'error'); }
    });
  }

  // sendAssist: gather optional page summary and call background chat, then parse and preview
  function sendAssist(pageHtml, userGoal, tab, ctx, uiSteps, respDiv) {
    // default response container to visible chat-response element
    respDiv = respDiv || document.getElementById('chat-response');
      const maxDomLen = 20000;
      const domPart = pageHtml ? String(pageHtml).slice(0, maxDomLen) : '';
      const mergedUi = (uiSteps ? uiSteps : '') + (domPart ? '\n\n[PAGE DOM]\n' + domPart : '');

      // Few-shot examples + explicit fenced-JSON requirement + goal fallback
      // guidance. Build from smaller strings to keep line lengths short.
      const fewShotLines = [
        'Example 1:',
        'Page snippet: <button id="add">Add</button>',
        'Output:',
        '```json',
        '[{"action":"click","selector":"#add","selector_type":"css",',
        '"confidence":0.9}]',
        '```',
        '',
        'Example 2:',
        'Page snippet: <input id="q"/>',
        'Output:',
        '```json',
        '[{"action":"input","selector":"#q","selector_type":"css",',
        '"value":"example","confidence":0.9}]',
        '```',
        ''
      ];
      const fewShot = fewShotLines.join('\n');

      const instructionLines = [
        'Analyze the provided page DOM and return a JSON array of actions to perform.',
        'Each action should be an object with the following fields:',
        '- action: one of click|input|select|navigate|hover',
        '- selector: a CSS selector or XPath that targets the element (string)',
        '- selector_type: "css" or "xpath" (prefer css when possible)',
        '- value: optional value for input/select/navigate',
        '- textFallback: optional visible text to find the element if selector fails',
        '- retries: optional integer of retry attempts (default 3)',
        '- confidence: optional float 0..1 indicating how confident you are this will work',
        'Please return the JSON array inside a single ```json``` code block.',
        'If no actions are appropriate, return [] inside the code block.',
        'If a user-provided Goal is present, prefer actions that achieve that goal;',
        'if unsure of an exact selector, return a best-effort action with a',
        'textFallback and set confidence to a low value (e.g. 0.2-0.4).',
        'Prefer robust selectors in this order: id, data-test/data-testid',
        'attributes, aria-label/role, name, stable class or attribute, then CSS',
        'path, then XPath.',
        'You may include an additional top-level "confidence" field (0..1).',
        'Do NOT include extraneous commentary outside the code block.'
      ];
      let instruction = fewShot + '\n' + instructionLines.join('\n');
      if (userGoal && String(userGoal).trim()) {
        instruction = 'Goal: ' + String(userGoal).trim() + '\n\n' + instruction;
      }

    // request structured summary if possible
    const fetchSummary = new Promise((resolve) => {
      try {
        if (tab && tab.id) {
          $host.tabs.sendMessage(tab.id, { operation: 'get_dom_summary' }, (respSum) => {
            const le = $host.runtime && $host.runtime.lastError;
            if (le) { logToUI(respDiv, `Could not get page summary: ${le.message || String(le)}`, 'warn'); resolve(null); } else resolve(respSum && respSum.summary ? respSum.summary : null);
          });
        } else resolve(null);
      } catch (e) { resolve(null); }
    });

    fetchSummary.then((pageSummary) => {
      let summaryText = '';
      try { if (pageSummary) summaryText = 'Page Summary (JSON):\n' + JSON.stringify(pageSummary, null, 2) + '\n\n'; } catch (e) { summaryText = ''; }

      const outgoing = {
        operation: 'chat',
        input: summaryText + instruction,
        context: ctx || null,
        ui_steps: mergedUi || null
      };

      // Debug: render a readable multi-line prompt preview near the
      // response area.
      try { showPromptPreview(respDiv, summaryText + instruction); } catch (e) {}

      $host.runtime.sendMessage(outgoing, (reply) => {
        const lastErr = $host.runtime && $host.runtime.lastError;
  if (lastErr) { logToUI(respDiv, `AI assist failed: ${lastErr.message || String(lastErr)}`, 'error'); return; }
  if (!reply || !reply.payload) { logToUI(respDiv, 'No suggestion received', 'warn'); return; }
        let text = null;
        try {
            if (
              reply.payload &&
              reply.payload.data &&
              reply.payload.data.reply &&
              reply.payload.data.reply.text
            ) {
              text = reply.payload.data.reply.text;
            }
        } catch (e) {}

        if (!text && typeof reply.payload === 'string') {
          text = reply.payload;
        }
        if (!text && reply.payload && reply.payload.reply) {
          text = reply.payload.reply;
        }
  if (!text) {
    logToUI(respDiv, 'AI did not provide actionable text', 'warn');
    // Still show the preview so the user can interact (reformat / retry / manual edit)
    try { showActionsPreview([], '', respDiv); } catch (e) {}
    return;
  }

        // attempt to extract JSON; if not found, try one automatic reformat
  const jsonText = extractJsonFromText(text);
        if (jsonText) {
          let actions = null;
          try { actions = JSON.parse(jsonText); } catch (e) { logToUI(respDiv, 'Failed to parse AI JSON: ' + e.message, 'error'); return; }
          if (!Array.isArray(actions) || actions.length === 0) {
            logToUI(respDiv, 'AI returned no actions', 'warn');
            // Show an empty preview so the user can reformat, retry with a goal, or edit manually
            try { showActionsPreview([], text, respDiv); } catch (e) {}
            return;
          }
          logToUI(respDiv, `AI suggested ${actions.length} actions.`, 'debug');
          showActionsPreview(actions, text, respDiv);
          return;
        }

        // automatic reformat attempt
        const autoReformatInstructionLines = [
          'Please convert the following assistant reply into a valid JSON array of actions only',
          '(no explanation). If no actions, return []. Reply with only JSON.',
          'Reply to the following text:\n\n' + text
        ];
        const autoReformatInstruction = autoReformatInstructionLines.join(' ');

        $host.runtime.sendMessage({ operation: 'chat', input: autoReformatInstruction }, (repAuto) => {
          const le = $host.runtime && $host.runtime.lastError; if (le) { logToUI(respDiv, `Reformat failed: ${le.message || String(le)}`, 'error'); return; }
          let autoText = null;
          try {
            if (
              repAuto &&
              repAuto.payload &&
              repAuto.payload.data &&
              repAuto.payload.data.reply &&
              repAuto.payload.data.reply.text
            ) {
              autoText = repAuto.payload.data.reply.text;
            }
          } catch (e) {}

          if (!autoText && repAuto && typeof repAuto.payload === 'string') {
            autoText = repAuto.payload;
          }
          if (!autoText && repAuto && repAuto.payload && repAuto.payload.reply) {
            autoText = repAuto.payload.reply;
          }
          if (!autoText) {
            logToUI(respDiv, 'AI did not return JSON actions. Click "Ask AI to return JSON only" to request a reformat.', 'warn');
            // Show empty preview to allow manual retry/reformat
            try { showActionsPreview([], text, respDiv); } catch (e) {}
            return;
          }
          const jt = extractJsonFromText(autoText);
          if (!jt) { logToUI(respDiv, 'Reformat attempt did not produce JSON. Click "Ask AI to return JSON only" to ask manually.', 'warn'); return; }
          let acts = null; try { acts = JSON.parse(jt); } catch (e) { logToUI(respDiv, 'Failed to parse reformatted JSON: ' + e.message, 'error'); return; }
          if (!Array.isArray(acts) || acts.length === 0) {
            logToUI(respDiv, 'Reformat returned no actions', 'warn');
            // If the user provided a goal and we have page DOM, try a simple text-match XPath fallback
            try {
              const goalText = userGoal && String(userGoal).trim() ? String(userGoal).trim() : null;
              const domLower = domPart ? String(domPart).toLowerCase() : '';
              if (goalText && domLower && domLower.indexOf(goalText.toLowerCase()) !== -1) {
                // helper to quote text for XPath
                const quoteForXPath = (s) => {
                  if (s.indexOf("'") === -1) return "'" + s + "'";
                  if (s.indexOf('"') === -1) return '"' + s + '"';
                  // fallback concat
                  return "concat('" + s.replace(/'/g, "',\"'\",'") + "')";
                };
                const goalLower = goalText.toLowerCase();
                const q = quoteForXPath(goalLower);
                const xpath = `//a[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), ${q})] | //button[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), ${q})] | //*[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), ${q})]`;
                const fallback = [{ action: 'click', selector: xpath, selector_type: 'xpath', textFallback: goalText, confidence: 0.3 }];
                logToUI(respDiv, 'No actions from AI — created a fallback click suggestion based on your goal and page content', 'debug');
                showActionsPreview(fallback, autoText || text, respDiv);
                return;
              }
            } catch (e) { /* ignore fallback errors */ }
            // Otherwise show empty preview
            try { showActionsPreview([], autoText || text, respDiv); } catch (e) {}
            return;
          }
          showActionsPreview(acts, autoText, respDiv);
        });
      });
    });
  }

  // export
  window._wb_initAiAssist = initAiAssist;
  window._wb_extractJsonFromText = extractJsonFromText;

}());
