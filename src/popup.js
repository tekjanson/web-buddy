/* global document $ chrome ClipboardJS */
const debug = false;
const gaAccount = 'UA-88380525-1';
const version = '0.3.0';
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
    const popupWindow = window.open(
      chrome.extension.getURL('./src/background.html'),
      'exampleName',
      'width=400,height=400',
      'modal=yes'
    );

    // var input = document.createElement("input");
    // input.type = "file";

    // input.onchange = (e) => {
    //   var file = e.target.files[0];
    //   console.log(file);
    //   const name = file.name;
    //   const size = file.size;
    //   const type = file.type;
    //   console.log(name, size, type);

    //   var fr = new FileReader();

    //   var text = fr.result; //text from pom file
    //   console.log(text);

    //   fr.onload = function (e) {
    //     var text = fr.result; //text from pom file
    //     //console.log(text);
    //     const start = "#robotcorder start";
    //     const stop = "#robotcorder stop";
    //     const arr = [];
    //     while (text.indexOf(stop) !== -1) {
    //       var mySubString = text.substring(
    //         text.indexOf(start) + start.length,
    //         text.indexOf(stop)
    //       );
    //       text = text.substring(text.indexOf(stop) + stop.length, text.length);
    //       //console.log(mySubString.substring(0, mySubString.indexOf("\n")));
    //       const s = mySubString.split("\n");
    //       var args_stuff = s[1];
    //       var just_args = args_stuff
    //         .substring(args_stuff.indexOf(":") +1, args_stuff.length)
    //         .split(",");

    //       console.log(just_args);
    //       var obj_man = {
    //         keyword: s[2],
    //         arguments: {
    //           number: parseInt(just_args[0]),
    //           types: []
    //         },
    //       };
    //       for (let j=1; j< just_args.length; j++){
    //         obj_man.arguments.types.push(just_args[j])
    //       }
    //       arr.push(obj_man);
    //       var x = document.getElementById("keywordSelect");
    //       var option = document.createElement("option");
    //       option.text = obj_man.keyword;
    //       option.value = JSON.stringify(obj_man);
    //       x.add(option);
    //       /*arr.push(mySubString);
    //                  console.log(mySubString)
    //                  console.log("line"); */
    //     }
    //     console.log(arr); //adds pom stuff to the console
    //     //need to get arr to print out within the extension though
    //   };
    //   fr.readAsText(file);

    //   //storage.set({ message: text, operation, canSave: false }); */
    // };

    // input.click();
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
        chrome.extension.getURL('./src/background.html'),
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

    ['record', 'resume', 'stop', 'pause', 'save', 'scan', 'pom'].forEach(
      (id) => {
        // add pom??
        document.getElementById(id).addEventListener('click', operation);
      }
    );

    ['demo', 'verify'].forEach((id) => {
      document.getElementById(id).addEventListener('change', settings);
    });

    document.getElementById('like').addEventListener('click', like);
    document.getElementById('info').addEventListener('click', info);
    document.getElementById('settings').addEventListener('click', toggle);

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
