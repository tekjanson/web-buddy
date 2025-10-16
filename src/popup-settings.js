/* popup-settings.js — manages AI provider badge, share-ui-steps badge, and storage listeners */
(function () {
  try {
    const initSettings = () => {
      const updateAiProviderBadge = (provider) => {
        try {
          const badge = document.getElementById('ai-provider-badge');
          if (!badge) return;
          const p = provider || 'unknown';
          badge.textContent = `AI: ${p}`;
          if (p === 'gemini') badge.style.background = '#10b981';
          else if (p === 'mqtt') badge.style.background = '#6366f1';
          else badge.style.background = '#6b7280';
        } catch (e) {}
      };

      try { storage.get({ ai_provider: 'mqtt' }, (s) => updateAiProviderBadge(s.ai_provider)); } catch (e) {}

      try {
        const badge = document.getElementById('ai-provider-badge');
        if (badge) {
          badge.title = 'Click to toggle AI provider (Shift+click opens Options)';
          badge.style.cursor = 'pointer';
          badge.addEventListener('click', (ev) => {
            try {
              if (ev.shiftKey) { try { window.$host.runtime.openOptionsPage(); } catch (e) { window.$host.tabs.create({ url: window.$host.runtime.getURL('src/options.html') }); } return; }
              storage.get({ ai_provider: 'mqtt' }, (s2) => {
                const cur = (s2 && s2.ai_provider) || 'mqtt';
                const next = cur === 'mqtt' ? 'gemini' : 'mqtt';
                storage.set({ ai_provider: next }, () => {
                  updateAiProviderBadge(next);
                  const respDiv = document.getElementById('chat-response'); if (respDiv) respDiv.textContent = `AI provider switched to ${next}`;
                });
              });
            } catch (e) { /* ignore */ }
          });
        }
      } catch (e) {}

      try { window.$host.storage.onChanged.addListener((changes) => { if (changes.ai_provider) updateAiProviderBadge(changes.ai_provider.newValue); }); } catch (e) {}

      const updateShareStepsBadge = (isShared) => {
        try {
          const badge = document.getElementById('share-ui-steps-badge'); if (!badge) return;
          badge.textContent = isShared ? 'UI Steps: On' : 'UI Steps: Off';
          badge.style.background = isShared ? '#10b981' : '#6b7280';
        } catch (e) {}
      };

      try { storage.get({ share_ui_steps: false }, (s) => updateShareStepsBadge(!!(s && s.share_ui_steps))); } catch (e) {}

      try {
        const badge = document.getElementById('share-ui-steps-badge');
        if (badge) {
          badge.title = 'Click to toggle sharing UI steps with AI';
          badge.style.cursor = 'pointer';
          badge.addEventListener('click', () => {
            try {
              storage.get({ share_ui_steps: false }, (s) => { const current = !!(s && s.share_ui_steps); const next = !current; storage.set({ share_ui_steps: next }, () => updateShareStepsBadge(next)); });
            } catch (e) {}
          });
        }
      } catch (e) {}

      try { window.$host.storage.onChanged.addListener((changes) => { if (changes.share_ui_steps) updateShareStepsBadge(changes.share_ui_steps.newValue); }); } catch (e) {}
    };

    window._wb_initSettings = initSettings;
  } catch (err) { /* quiet */ }
}());
