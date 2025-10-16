/* AI Assist flow extracted from popup.js
   Expects: $host, storage, getTargetTab, document, window.popupHelpers (renderChatMessage)
*/
(function () {
  try {
    const initAiAssist = () => {
      const aiBtn = document.getElementById('ai-assist');
      if (!aiBtn) return;
      aiBtn.addEventListener('click', () => {
        const respDiv = document.getElementById('chat-response');
        if (respDiv) respDiv.textContent = 'Requesting AI suggestions...';

        try {
          storage.get({ chat_context: null, share_ui_steps: false }, (s) => {
            const ctx = s && s.chat_context ? s.chat_context : null;
            const includeSteps = s && s.share_ui_steps;
            const uiSteps = includeSteps ? (document.getElementById('textarea-script').value || '') : '';

            getTargetTab((t) => {
              const sendAssist = (pageHtml, userGoal) => {
                const maxDomLen = 20000;
                const domPart = pageHtml ? String(pageHtml).slice(0, maxDomLen) : '';
                const mergedUi = [uiSteps || ''].concat(domPart ? [`[PAGE DOM]\n${domPart}`] : []).filter(Boolean).join('\n\n');
                let instruction = 'Analyze the provided page DOM and return a JSON array of actions to perform. Each action must be an object with fields: action (click|input|select|navigate), selector (CSS or XPath), value (optional). Respond with ONLY valid JSON and nothing else. If you cannot find actions, return an empty array []. You may wrap the JSON in a single ```json``` code block. Example:\n```json\n[{"action":"click","selector":"button#submit","value":null}]\n```';
                if (userGoal && String(userGoal).trim()) instruction = `Goal: ${String(userGoal).trim()}\n\n` + instruction;
                const outgoing = { operation: 'chat', input: instruction, context: ctx, ui_steps: mergedUi || null };
                $host.runtime.sendMessage(outgoing, (reply) => {
                  const lastErr = $host.runtime && $host.runtime.lastError;
                  if (lastErr) { if (respDiv) respDiv.textContent = `AI assist failed: ${lastErr.message || String(lastErr)}`; return; }
                  if (!reply || !reply.payload) { if (respDiv) respDiv.textContent = 'No suggestion received'; return; }
                  let text = null;
                  try { if (reply.payload && reply.payload.data && reply.payload.data.reply && reply.payload.data.reply.text) text = reply.payload.data.reply.text; } catch (e) {}
                  if (!text && typeof reply.payload === 'string') text = reply.payload;
                  if (!text && reply.payload && reply.payload.reply) text = reply.payload.reply;
                  if (!text) { if (respDiv) respDiv.textContent = 'AI did not provide actionable text'; return; }

                  // Extract JSON from fences or first JSON-like block
                  let jsonText = null;
                  try {
                    const fenceJson = text.match(/```json\s*([\s\S]*?)\s*```/i);
                    if (fenceJson && fenceJson[1]) jsonText = fenceJson[1].trim();
                    if (!jsonText) {
                      const fenceAny = text.match(/```\s*([\s\S]*?)\s*```/i);
                      if (fenceAny && fenceAny[1]) jsonText = fenceAny[1].trim();
                    }
                    if (!jsonText) {
                      const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                      if (m) jsonText = m[0];
                    }
                  } catch (e) { jsonText = null; }

                  if (!jsonText) {
                    const rawEl = document.getElementById('chat-raw'); if (rawEl) { try { rawEl.textContent = text; rawEl.classList.remove('hidden'); } catch (ee) {} }
                    if (respDiv) respDiv.textContent = 'AI did not return JSON actions. Click "Reformat" to ask the AI to return JSON only.';
                    try {
                      let btn = document.getElementById('ai-reformat-btn');
                      if (!btn) {
                        btn = document.createElement('button'); btn.id = 'ai-reformat-btn'; btn.className = 'btn'; btn.textContent = 'Reformat';
                        if (respDiv) { respDiv.appendChild(document.createTextNode(' ')); respDiv.appendChild(btn); }
                        btn.addEventListener('click', () => {
                          if (respDiv) respDiv.textContent = 'Requesting reformat...';
                          const reformatInstruction = 'Please convert the following assistant reply into a valid JSON array of actions only (no explanation). If no actions, return []. Reply with only JSON. Reply to the following text:\n\n' + text;
                          $host.runtime.sendMessage({ operation: 'chat', input: reformatInstruction }, (rep2) => {
                            const lastErr = $host.runtime && $host.runtime.lastError; if (lastErr) { if (respDiv) respDiv.textContent = `Reformat failed: ${lastErr.message || String(lastErr)}`; return; }
                            let t2 = null; try { if (rep2 && rep2.payload && rep2.payload.data && rep2.payload.data.reply && rep2.payload.data.reply.text) t2 = rep2.payload.data.reply.text; } catch (e) {}
                            if (!t2 && rep2 && typeof rep2.payload === 'string') t2 = rep2.payload;
                            if (!t2 && rep2 && rep2.payload && rep2.payload.reply) t2 = rep2.payload.reply;
                            if (!t2) { if (respDiv) respDiv.textContent = 'Reformat did not return text'; return; }
                            let jt = null; try { const f = t2.match(/```json\s*([\s\S]*?)\s*```/i) || t2.match(/```\s*([\s\S]*?)\s*```/i) || t2.match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (f) jt = (f[1] || f[0]).trim(); } catch (e) { jt = null; }
                            if (!jt) { if (respDiv) respDiv.textContent = 'Reformat attempt did not produce JSON'; return; }
                            let acts = null; try { acts = JSON.parse(jt); } catch (e) { if (respDiv) respDiv.textContent = 'Failed to parse reformatted JSON: ' + e.message; return; }
                            if (!Array.isArray(acts) || acts.length === 0) { if (respDiv) respDiv.textContent = 'Reformat returned no actions'; return; }
                            const ok2 = confirm(`AI suggested ${acts.length} actions after reformat. Execute them?`);
                            if (!ok2) { if (respDiv) respDiv.textContent = 'Execution cancelled'; return; }
                            const commands2 = acts.map((a) => ({ action: a.action, selector: a.selector || a.select || a.xpath || '', value: a.value || a.text || a.input || null }));
                            $host.runtime.sendMessage({ operation: 'run_translated', commands: commands2 }, (r2) => { const le2 = $host.runtime && $host.runtime.lastError; if (le2 && respDiv) respDiv.textContent = `Execution error: ${le2.message}`; else if (respDiv) respDiv.textContent = 'AI actions sent for execution (reformatted)'; });
                          });
                        });
                      }
                    } catch (e) { /* ignore UI creation errors */ }
                    return;
                  }

                  let actions = null;
                  try { actions = JSON.parse(jsonText); } catch (e) { if (respDiv) respDiv.textContent = 'Failed to parse AI JSON: ' + e.message; return; }
                  if (!Array.isArray(actions) || actions.length === 0) {
                    const rawEl2 = document.getElementById('chat-raw'); if (rawEl2) { try { rawEl2.textContent = text; rawEl2.classList.remove('hidden'); } catch (ee) {} }
                    if (respDiv) respDiv.textContent = 'AI returned no actions';
                    try {
                      let tryBtn = document.getElementById('ai-try-goal-btn');
                      if (!tryBtn) {
                        tryBtn = document.createElement('button'); tryBtn.id = 'ai-try-goal-btn'; tryBtn.className = 'btn'; tryBtn.textContent = 'Try with goal';
                        if (respDiv) { respDiv.appendChild(document.createTextNode(' ')); respDiv.appendChild(tryBtn); }
                        tryBtn.addEventListener('click', () => {
                          const g = prompt('Describe the goal for the AI (e.g. "log in", "add item to cart"). Leave empty to cancel.');
                          if (!g) return; if (respDiv) respDiv.textContent = 'Retrying with your goal...'; sendAssist(pageHtml, g);
                        });
                      }
                    } catch (e) { /* ignore */ }
                    return;
                  }

                  if (respDiv) respDiv.textContent = `AI suggested ${actions.length} actions.`;
                  try {
                    const ok = confirm(`AI suggested ${actions.length} actions. Execute them on the active page? This may click, fill, or navigate pages.`);
                    if (!ok) { if (respDiv) respDiv.textContent = 'Execution cancelled by user'; return; }
                    const commands = actions.map((a) => ({ action: a.action, selector: a.selector || a.select || a.xpath || '', value: a.value || a.text || a.input || null }));
                    $host.runtime.sendMessage({ operation: 'run_translated', commands }, (r) => { const le = $host.runtime && $host.runtime.lastError; if (le && respDiv) respDiv.textContent = `Execution error: ${le.message}`; else if (respDiv) respDiv.textContent = 'AI actions sent for execution'; });
                  } catch (e) { if (respDiv) respDiv.textContent = `Failed to send actions: ${e && e.message ? e.message : e}`; }
                });
              };

              if (t && t.id) {
                try { $host.tabs.sendMessage(t.id, { operation: 'get_page_html' }, (resp) => { const lastErr = $host.runtime && $host.runtime.lastError; if (lastErr) sendAssist(null); else sendAssist(resp && resp.html ? resp.html : null); }); } catch (e) { sendAssist(null); }
              } else sendAssist(null);
            });
          });
        } catch (e) { const respDiv = document.getElementById('chat-response'); if (respDiv) respDiv.textContent = `AI assist error: ${e && e.message ? e.message : e}`; }
      });
    };

    // expose initializer for DOMContentLoaded wiring in popup.js
    window._wb_initAiAssist = initAiAssist;
  } catch (err) { /* initialization failure should not break popup */ }
}());
