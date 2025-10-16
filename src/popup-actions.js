/* popup-actions.js — handles running recorded lists, save/run buttons and run_translated wiring */
(function () {
  try {
    const runTranslated = (actions, targetTabId) => {
      if (!actions) return Promise.reject(new Error('no actions'));
      const msg = { operation: 'run_translated', actions, targetTabId };
      return new Promise((resolve) => { window.$host.runtime.sendMessage(msg, (resp) => resolve(resp)); });
    };

    const runList = async () => {
      try {
        const listJson = document.getElementById('recorded').value || document.getElementById('steps').value || '';
        let list;
        try { list = JSON.parse(listJson); } catch (e) { list = null; }
        if (!list) { alert('No recorded list available'); return; }
        const tab = await new Promise((res) => window.getTargetTab(res));
        const resp = await runTranslated(list, tab && tab.id);
        console.info('runList response', resp);
        return resp;
      } catch (e) { console.error('runList failed', e); }
    };

    const saveList = () => {
      const el = document.getElementById('recorded');
      if (!el) return;
      const txt = el.value || '';
      storage.set({ last_recorded: txt });
      if (window.popupHelpers && window.popupHelpers.toast) window.popupHelpers.toast('Saved');
    };

    const initActions = () => {
      const runBtn = document.getElementById('run');
      if (runBtn) runBtn.addEventListener('click', runList);
      const saveBtn = document.getElementById('save');
      if (saveBtn) saveBtn.addEventListener('click', saveList);
    };

    window._wb_initActions = initActions;
    window._wb_runTranslated = runTranslated;
  } catch (err) { /* noop */ }
}());
