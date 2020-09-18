/* global chrome URL Blob */
/* global instruction filename statusMessage url tab logo translator */

const host = chrome;
const once = {
  once: true,
};
let elementState = {state: false};
let list = [];
let libSource =[];
let script;
const storage = host.storage.local;
const content = host.tabs;
const icon = host.browserAction;
const maxLength = 5000;
let recordTab = 0;
let demo = false;
let verify = false;

storage.set({
  locators: ["for", "name", "id", "title", "href", "class"],
  operation: "stop",
  message: instruction,
  demo: false,
  verify: false,
  canSave: false,
  isBusy: false,
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

  if (item.trigger === "click") {
    return;
  }

  if (item.trigger === "change" && prevItem.trigger === "click") {
    list[list.length - 1] = item;
    return;
  }

  list.push(item);
}

host.runtime.onMessage.addListener((request, sender, sendResponse) => {
  let { operation } = request;
  console.log(operation)
  console.log(tab)
  let back_tabs
  storage.get({'default_tabs':'default_tabs',tabs:{}}, (backup_tab) => {
    back_tabs = backup_tab.tabs[0]
  })
  // console.log(back_tabs)
  // content.query(tab, (tabs) => {
  //   console.log(tabs)
  // })
  if (operation === "record") {
    icon.setIcon({ path: logo[operation] }); //sets robot icon

    content.query(tab, (tabs) => {
      console.log(tabs)
      if (tabs[0]) {
      [recordTab] = tabs;
      list = [
        {
          type: "url",
          path: recordTab.url,
          time: 0,
          trigger: "record",
          title: recordTab.title,
        },
      ];
      content.sendMessage(tabs[0].id, {
        operation,
        locators: request.locators,
      });
    } else if (back_tabs) {
      [recordTab] = [back_tabs];
      list = [
        {
          type: "url",
          path: recordTab.url,
          time: 0,
          trigger: "record",
          title: recordTab.title,
        },
      ];
      content.sendMessage(back_tabs.id, {
        operation,
        locators: request.locators,
      });
    }
    else {
      console.log('went bad  with ',tabs)
      // TODO need to save id and ignore the bad inputs, reset focus
      storage.set({
        locators: ["for", "name", "id", "title", "href", "class"],
        operation: "stop",
        message: error,
        demo: false,
        verify: false,
        canSave: false,
        isBusy: false,
      });
    }


    });

    storage.set({
      message: statusMessage[operation],
      operation,
      canSave: false,
    });
  } else if (operation === "pause") {
    icon.setIcon({ path: logo.pause });
    back_tabs.id,
    storage.set({ operation: "pause", canSave: false, isBusy: false });
  } else if (operation === "pomer") {
    var scripts = request.results;
    var trigger = scripts[0];
    scripts.shift();
    source = scripts.pop()
    console.log(scripts)
    console.log(source)
    if (! libSource.includes(source)) {
      libSource.push(source)
    }
    var maker = {
      trigger,
      type: "pomer",
      arguments: scripts,
      time: new Date().getTime(),
    };
    selection(maker);
    icon.setIcon({ path: logo["pause"] });
    setTimeout(() => {
      icon.setIcon({ path: logo.record });
    }, 1000);
  } else if (operation === "pomerSelect") {
    elementState = {
      state: true,
      request,
      sender
    }

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



  } else if (operation === "resume") {
    operation = "record";

    icon.setIcon({ path: logo[operation] });

    content.query(tab, (tabs) => {
      if (tabs[0]){
        [recordTab] = tabs;

      } else {
        [recordTab] = [back_tabs]
      }

      content.sendMessage(tabs[0].id, {
        operation,
        locators: request.locators,
      });


    });

    storage.set({
      message: statusMessage[operation],
      operation,
      canSave: false,
    });
  } else if (operation === "scan") {
    icon.setIcon({ path: logo.action });

    content.query(tab, (tabs) => {
      if(tabs[0]){
        [recordTab] = tabs;
      } else {
        [recordTab] = [back_tabs]
      }
      list = [
        {
          type: "url",
          path: recordTab.url,
          time: 0,
          trigger: "scan",
          title: recordTab.title,
        },
      ];
      if (tabs[0]){
        content.sendMessage(tabs[0].id, {
          operation,
          locators: request.locators,
        });
      } else {
        content.sendMessage(back_tabs.id, {
          operation,
          locators: request.locators,
        });
      }

    });

    storage.set({
      message: statusMessage[operation],
      operation: "scan",
      canSave: true,
      isBusy: true,
    });
  } else if (operation === "stop") {
    recordTab = 0;
    icon.setIcon({ path: logo[operation] });

    script = translator.generateOutput(list, maxLength, demo, verify);
    content.query(tab, (tabs) => {
      console.log(tabs)
      if(tabs[0]){
        content.sendMessage(tabs[0].id, { operation: "stop" });
      } else {
        content.sendMessage(back_tabs.id, { operation: "stop" });
      }
    });

    storage.set({ message: script, operation, canSave: true });
  } else if (operation === "save") {
    const file = translator.generateFile(list, maxLength, demo, verify, libSource);
    const blob = new Blob([file], { type: "text/plain;charset=utf-8" });

    host.downloads.download({
      url: URL.createObjectURL(blob, { oneTimeOnly: true }),
      filename,
    });
  } else if (operation == "pom") {
    //if the button is pom
    storage.set({
      message: statusMessage[operation],
      operation,
      canSave: false,
    });
  } else if (operation === "settings") {
    ({ demo, verify } = request);

    storage.set({ locators: request.locators, demo, verify });
  } else if (operation === "load") {
    storage.get({ operation: "stop", locators: [] }, (state) => {
      content.sendMessage(sender.tab.id, {
        operation: state.operation,
        locators: state.locators,
      });
    });
  } else if (operation === "info") {
    host.tabs.create({ url });
  } else if (operation === "action") {

console.log('asfdesxfdesxc',request)
    if (elementState.state === true){
      elementState.state = false
      icon.setIcon({ path: logo.pause });
      setTimeout(() => {
        icon.setIcon({ path: logo.record });
      }, 1000);
     content.sendMessage(elementState.sender.tab.id, {
        msg: "element",
        data: {
          request,
          elementState
        },
      });
      request.script = null

    }

    if (request.script) { 
      console.log(request.script)
      selection(request.script);
      icon.setIcon({ path: logo[operation] });
      setTimeout(() => {
        icon.setIcon({ path: logo.record });
      }, 1000);
    }

    if (request.scripts) {
      icon.setIcon({ path: logo.stop });
      list = list.concat(request.scripts);
      script = translator.generateOutput(list, maxLength, demo, verify);

      storage.set({ message: script, operation: "stop", isBusy: false });
    }
  }
});
