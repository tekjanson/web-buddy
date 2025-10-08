/* global document chrome rcLog */

// pom.js - helper for POM import and UI wiring used inside extension pages (options/popup)
// Responsibilities:
// - Provide a small API to initialize POM import button and keyword select UI
// - Persist parsed POM data to chrome.storage and notify background when user selects

// Use a private host reference to avoid colliding with other scripts that may
// declare a global `host` constant (options/popup load multiple helpers).
const _host = (typeof host !== 'undefined') ? host : (typeof chrome !== 'undefined' ? chrome : undefined);

function parsePomText(text) {
  const start = '#robotcorder start';
  const stop = '#robotcorder stop';
  const source = '#sourceLocation:';
  const arr = [];
  let mySourceString = '';
  if (text.indexOf(source) !== -1 && text.indexOf(start) !== -1) {
    mySourceString = text.substring(text.indexOf(source) + source.length, text.indexOf(start));
  }

  while (text.indexOf(stop) !== -1 && text.indexOf(start) !== -1) {
    const mySubString = text.substring(text.indexOf(start) + start.length, text.indexOf(stop));
    text = text.substring(text.indexOf(stop) + stop.length, text.length);
    const s = mySubString.split('\n');
    const args_stuff = s[1] || '';
    const just_args = args_stuff.substring((args_stuff.indexOf(':') + 1) || 0, args_stuff.length).split(',');
    const obj_man = {
      keyword: s[2],
      arguments: {
        number: parseInt(just_args[0], 10) || 0,
        types: [],
        sourecPath: mySourceString
      }
    };
    for (let j = 1; j < just_args.length; j++) obj_man.arguments.types.push(just_args[j]);
    arr.push(obj_man);
  }
  return arr;
}

function savePomToStorage(parsedArr) {
  try {
    if (!_host) throw new Error('no host available');
    _host.storage.local.set({ pom: JSON.stringify(parsedArr) });
  } catch (e) {
    if (typeof rcLog !== 'undefined') rcLog('error', 'failed to save pom', e);
  }
}

function createHiddenFileInput(onLoadCallback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';

  input.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (typeof rcLog !== 'undefined') rcLog('info', 'pom file selected', file.name);

    const fr = new FileReader();
    fr.addEventListener('load', () => {
      const text = fr.result || '';
      const parsed = parsePomText(text);
      savePomToStorage(parsed);
      if (typeof onLoadCallback === 'function') onLoadCallback(parsed);
    });
    fr.readAsText(file);
  });

  document.body.appendChild(input);
  return input;
}

function initPomUI() {
  try {
    if (!document || !document.getElementById) return;
    const keywordDiv = document.getElementById('keywordDiv');
    if (!keywordDiv) return;

    // create hidden file input for uploading POM files
    const input = createHiddenFileInput(() => loadPom());

    function pomSave() {
      const ta = document.getElementById('tempDiv') && document.getElementById('tempDiv').getElementsByTagName('textarea');
      const activities = document.getElementById('keywordSelect');
      if (!activities) return;
      const index = activities.selectedIndex;
      const arrGuments = [];
      arrGuments.push(JSON.parse(activities.options[index].value).keyword);
      if (ta) for (const element of ta) arrGuments.push(element.value);
      if (_host) _host.runtime.sendMessage({ operation: 'pomer', results: arrGuments });
    }

    function loadPom() {
      if (!_host) return;
      _host.storage.local.get(['pom'], (items) => {
        const arr = (items && items.pom) ? JSON.parse(items.pom) : [];
        const x = document.getElementById('keywordSelect');
        if (!x) return;
        // clear existing
        while (x.options && x.options.length) x.remove(0);
        for (let i = 0; i < arr.length; i++) {
          const option = document.createElement('option');
          option.text = arr[i].keyword;
          option.value = JSON.stringify(arr[i]);
          x.add(option);
        }

        x.addEventListener('change', () => {
          const appendDiv = document.getElementById('keywordDiv');
          const killDiv = document.getElementById('tempDiv');
          if (killDiv !== null) killDiv.remove();
          const tempDiv = document.createElement('div');
          tempDiv.id = 'tempDiv';
          appendDiv.appendChild(tempDiv);
          const activities = document.getElementById('keywordSelect');
          const index = activities.selectedIndex;
          const reObj = JSON.parse(activities.options[index].value);
          for (let i = 0; i < (reObj.arguments.number || 0); i++) {
            const btn = document.createElement('textarea');
            btn.id = `${reObj.keyword}-${i}`;
            btn.value = `${reObj.arguments.types[i] || ''}`;
            if (reObj.arguments.types[i] === 'element') {
              btn.addEventListener('click', () => {
                if (_host) _host.runtime.sendMessage({ operation: 'pomerSelect', btnId: `${reObj.keyword}-${i}` });
              });
            }
            tempDiv.appendChild(btn);
          }
          const sourceArea = document.createElement('textarea');
          tempDiv.appendChild(sourceArea);
          sourceArea.value = reObj.arguments.sourecPath || '';
          const submitButton = document.createElement('input');
          submitButton.type = 'button';
          submitButton.value = 'submit';
          tempDiv.appendChild(submitButton);
          submitButton.addEventListener('click', pomSave);
        });
      });
    }

    // populate on load
    loadPom();

    // listener for element messages (from background when user selects element)
    if (_host) {
      _host.runtime.onMessage.addListener((request) => {
        if (request && request.msg === 'element') {
          try {
            const btn = document.getElementById(request.data.elementState.request.btnId);
            if (btn) btn.value = request.data.request.script.path;
          } catch (e) {
            if (typeof rcLog !== 'undefined') rcLog('error', 'failed to apply element message', e);
          }
        }
      });
    }
  } catch (e) {
    if (typeof rcLog !== 'undefined') rcLog('error', 'POM migration init error', e);
  }
}

// Export small public API for use in UI pages
window.RobotcorderPom = {
  init: initPomUI,
  parse: parsePomText,
  createInput: createHiddenFileInput
};

// Auto-initialize if this looks like an extension options/popup page
try {
  if (document && document.getElementById && document.getElementById('keywordDiv')) {
    initPomUI();
  }
} catch (e) {
  // ignore in non-browser / test environments
}


// Remote entry loader: loads a remoteEntry.js URL stored in chrome.storage.local.remote_entry_url
// Module Federation / Remote entry support removed.
// No runtime remote-loading helpers are provided in this build. We keep
// small no-op stubs on window.RobotcorderPom to avoid caller errors.
window.RobotcorderPom = Object.assign(window.RobotcorderPom || {}, {});

// Helper: build nested Providers from exported module contexts
// React rendering support removed: Robotcorder will no longer attempt to create
// React Provider trees or render React components. Remainings of Module
// Federation mounting will call exposed modules as plain mount/render
// functions (signature: mount(target, mountProps) or render(target, mountProps)).

// React rendering removed. If an exposed module is a plain function it will be
// invoked with (target, mountProps). If it provides a `.mount` method it will
// be called with (target, mountProps). No UMD React will be injected anymore.

// mountFederated: A best-effort helper that reads the configured remote container and exposed
// module from storage and attempts to initialize Module Federation container and render into
// an element with id 'remote-root'. It expects the remote to expose an init and the module.
// Usage: RobotcorderPom.mountFederated(callback)
// removed mountFederated

// autodiscoverExposes: probe ESM remote and container for candidate expose names
// removed autodiscoverExposes

// mountFederatedWith: explicit mount for a container name and expose path
// removed mountFederatedWith

// Auto-load + auto-mount remoteEntry by default when this helper is present in a page.
// Respects stored `remote_entry_url` and `remote_auto_mount` flag (defaults to true).
// auto-load removed
