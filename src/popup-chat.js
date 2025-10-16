/* Chat send flow extracted from popup.js
   Expects: $host, storage, document, window.popupHelpers.renderChatMessage
*/
(function () {
  try {
    const initChatSend = () => {
      const chatSend = document.getElementById('chat-send');
      if (!chatSend) return;
      chatSend.addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        const respDiv = document.getElementById('chat-response');
        if (!input || !respDiv) return;
        const text = input.value && input.value.trim();
        if (!text) { respDiv.textContent = 'Please enter a message'; return; }
        respDiv.textContent = 'Sending...';

        try {
          storage.get({ chat_context: null, share_ui_steps: false }, (s) => {
            const ctx = s && s.chat_context ? s.chat_context : null;
            const includeSteps = s && s.share_ui_steps;
            const uiSteps = includeSteps
              ? (document.getElementById('textarea-script').value || '')
              : '';

              // Use getTargetTab helper (avoids scanning the popup itself) and supports fallbacks
              getTargetTab((t) => {

              function sendChatWithPageDom(pageHtml) {
                const maxDomLen = 20000;
                let domPart = '';
                if (pageHtml && typeof pageHtml === 'string') domPart = String(pageHtml).slice(0, maxDomLen);
                const mergedUi = [uiSteps || '']
                  .concat(domPart ? [`[PAGE DOM]\n${domPart}`] : [])
                  .filter(Boolean)
                  .join('\n\n');
                // Prepare site-specific instructions (if any) from textarea or storage
                const siteInstructionsEl = document.getElementById('site-instructions');
                let siteHints = siteInstructionsEl && siteInstructionsEl.value
                  && siteInstructionsEl.value.trim() ? siteInstructionsEl.value.trim() : null;

                // If not in textarea, try to load per-site stored hints (storage key: site_hints)
                const buildOutgoing = (hints) => {
                  let prefixedInput = text;
                  if (hints) prefixedInput = `Site instructions:\n${hints}\n\nUser question:\n${text}`;
                  return { operation: 'chat', input: prefixedInput, context: ctx, ui_steps: mergedUi || null };
                };

                const outgoing = buildOutgoing(siteHints);
                if (window.popupHelpers && window.popupHelpers.renderChatMessage) {
                  window.popupHelpers.renderChatMessage('user', text);
                }

                $host.runtime.sendMessage(outgoing, (reply) => {
                  const lastErr = $host.runtime && $host.runtime.lastError;
                  if (lastErr) {
                    let errText = lastErr.message || String(lastErr);
                    if (lastErr.stack) errText += `\n${lastErr.stack}`;
                    respDiv.textContent = `Chat failed: ${errText}`;
                    try {
                      $host.runtime.sendMessage({ operation: 'mqtt_status' }, (diagResp) => {
                        if (!diagResp) return;
                        if (diagResp.error) { respDiv.textContent += `\nDiagnostics error: ${diagResp.error}`; return; }
                        const d = diagResp.diagnostics || {};
                        const lines = [];
                        if (d.control) lines.push(`control.enabled=${d.control.enabled}, url=${(d.control.broker && d.control.broker.brokerUrl) || 'none'}`);
                        if (d.llm) lines.push(`llm.enabled=${d.llm.enabled}, url=${(d.llm.broker && d.llm.broker.brokerUrl) || 'none'}`);
                        lines.push(`bridgePresent=${d.bridgePresent}`);
                        lines.push(`clientPresent=${d.clientPresent}`);
                        lines.push(`clientConnected=${d.clientConnected}`);
                        lines.push(`mqttPrefix=${d.mqttPrefix || 'none'}`);
                        respDiv.textContent += `\nDiagnostics:\n${lines.join('\n')}`;
                      });
                    } catch (e) { respDiv.textContent += `\nDiagnostics request failed: ${e && e.message ? e.message : e}`; }
                    return;
                  }
                  if (!reply) { respDiv.textContent = 'No reply received'; return; }

                  try {
                    const rawEl = document.getElementById('chat-raw');
                    if (rawEl) {
                      try {
                        rawEl.textContent = JSON.stringify(reply, null, 2);
                      } catch (e) {
                        rawEl.textContent = String(reply);
                      }
                    }

                    let friendly = null;
                    if (reply && reply.payload && typeof reply.payload === 'object') {
                      const p = reply.payload;
                      try {
                        if (p.data && p.data.tokenId) {
                          storage.set({
                            chat_context: {
                              tokenId: p.data.tokenId,
                              uuid: (reply.uuid || (reply.callback && reply.callback.uuid) || null)
                            }
                          });
                        }
                      } catch (e) {}

                      if (p.data && p.data.reply && typeof p.data.reply.text === 'string') friendly = p.data.reply.text;
                      else if (p.response && typeof p.response === 'string') friendly = p.response;
                      else if (p.reply && typeof p.reply === 'object' && (p.reply.text || p.reply.response)) friendly = p.reply.text || p.reply.response;
                      else if (p.reply && typeof p.reply === 'string') friendly = p.reply;
                      else if (p.responseText && typeof p.responseText === 'string') friendly = p.responseText;
                      else if (
                        p.choices && Array.isArray(p.choices) && p.choices[0]
                        && (p.choices[0].text || p.choices[0].message)
                      ) friendly = p.choices[0].text || p.choices[0].message;
                      else if (p.raw && p.raw.text) friendly = p.raw.text;
                    }
                      if (!friendly && reply && reply.payload && typeof reply.payload === 'string') {
                        friendly = reply.payload;
                      }
                    if (!friendly && reply && reply.response) {
                      friendly = reply.response;
                    }
                    if (!friendly) {
                      friendly = 'Received a non-text reply from the AI. Click "Show details" to view raw JSON and diagnostics.';
                      try {
                        if (rawEl) rawEl.classList.remove('hidden');
                        window.popupHelpers.renderChatMessage('assistant', friendly);
                        respDiv.innerHTML = '';
                        const textNode = document.createTextNode(friendly + ' ');
                        respDiv.appendChild(textNode);
                        const link = document.createElement('a');
                        link.href = '#';
                        link.id = 'chat-show-details';
                        link.textContent = 'Show details';
                        link.style.marginLeft = '8px';
                        link.addEventListener('click', (ev) => {
                          ev.preventDefault();
                          if (!rawEl) return;
                          const hidden = rawEl.classList.contains('hidden');
                          if (hidden) {
                            rawEl.classList.remove('hidden');
                            link.textContent = 'Hide details';
                          } else {
                            rawEl.classList.add('hidden');
                            link.textContent = 'Show details';
                          }
                        });
                        respDiv.appendChild(link);
                      } catch (e) { respDiv.textContent = friendly; }
                    } else {
                      if (window.popupHelpers && window.popupHelpers.renderChatMessage) window.popupHelpers.renderChatMessage('assistant', friendly);
                      respDiv.textContent = friendly;
                    }
                  } catch (e) { respDiv.textContent = String(reply); }
                });
                // If site instructions were empty, attempt to fetch them from the page (content script) and also check storage for per-site hints
                (function ensureSiteHints() {
                  if (siteHints) return; // already present
                  try {
                    // Ask content script for the current page origin and attempt a fetch there.
                    if (t && t.id) {
                      try {
                        $host.tabs.sendMessage(t.id, { operation: 'get_page_origin' }, (originResp) => {
                          const lastErr = $host.runtime && $host.runtime.lastError;
                          const origin = (originResp && originResp.origin)
                            ? originResp.origin
                            : null;
                          if (!origin) {
                            // fallback to storage per-site map
                            storage.get({ site_hints: {} }, (s) => {
                              try { const map = s && s.site_hints ? s.site_hints : {}; const val = origin && map[origin] ? map[origin] : null; if (val) { const el = document.getElementById('site-instructions'); if (el) el.value = val; } } catch (ee) {}
                            });
                            return;
                          }
                          // try to fetch origin + '/ai-instructions' via background (to avoid CORS). Use runtime.sendMessage to background to fetch.
                          try {
                            $host.runtime.sendMessage({ operation: 'fetch_site_instructions', origin }, (fetchResp) => {
                              if (fetchResp && fetchResp.instructions) {
                                const el = document.getElementById('site-instructions'); if (el && !el.value) el.value = fetchResp.instructions;
                                // also persist into storage.site_hints[origin]
                                try {
                                  storage.get({ site_hints: {} }, (s) => {
                                    const map = s && s.site_hints ? s.site_hints : {};
                                    map[origin] = fetchResp.instructions;
                                    storage.set({ site_hints: map });
                                  });
                                } catch (ee) {}
                              } else {
                                // fallback to stored map
                                storage.get({ site_hints: {} }, (s) => { try { const map = s && s.site_hints ? s.site_hints : {}; const val = map[origin] || null; if (val) { const el = document.getElementById('site-instructions'); if (el && !el.value) el.value = val; } } catch (ee) {} });
                              }
                            });
                          } catch (e) { /* ignore */ }
                        });
                      } catch (e) { /* ignore */ }
                    }
                  } catch (e) { /* ignore */ }
                }());
              } // end sendChatWithPageDom

              // If we found a target tab, request page HTML from it, else proceed with null
                  if (t && t.id) {
                    try {
                      $host.tabs.sendMessage(t.id, { operation: 'get_page_html' }, (resp) => {
                        const lastErr = $host.runtime && $host.runtime.lastError;
                        if (lastErr) sendChatWithPageDom(null);
                        else sendChatWithPageDom(resp && resp.html ? resp.html : null);
                      });
                    } catch (e) {
                      sendChatWithPageDom(null);
                    }
                  } else {
                    sendChatWithPageDom(null);
                  }
            });
          });
        } catch (e) { respDiv.textContent = `Chat send error: ${e && e.message ? e.message : e}`; }
      });
    };

    // expose initializer for DOMContentLoaded wiring in popup.js
    window._wb_initChatSend = initChatSend;
  } catch (err) { /* fail quietly */ }
}());
