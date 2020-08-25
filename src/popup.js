/* global document $ chrome ClipboardJS */
const debug = false;
const gaAccount = "UA-88380525-1";
const version = "0.3.0";

const host = chrome;
const storage = host.storage.local;

/*eslint-disable */
var _gaq = _gaq || [];
_gaq.push(["_setAccount", gaAccount]);
_gaq.push(["_trackPageview"]);
(function () {
  var ga = document.createElement("script");
  ga.type = "text/javascript";
  ga.async = true;
  ga.src = "https://ssl.google-analytics.com/ga.js";
  var s = document.getElementsByTagName("script")[0];
  s.parentNode.insertBefore(ga, s);
})();
/* eslint-enable */

function logger(data) {
  if (debug) document.getElementById("textarea-log").value = data;
}

function analytics(data) {
  const versionData = data;
  if (gaAccount) {
    versionData[2] = `${version} ${data[2]}`;
    _gaq.push(versionData);
    logger(gaAccount && versionData);
  }
}

const clipboard = new ClipboardJS("#copy");

const copyStatus = (className) => {
  $("#copy").addClass(className);
  setTimeout(() => {
    $("#copy").removeClass(className);
  }, 3000);
};

clipboard.on("success", (e) => {
  copyStatus("copy-ok");
  analytics(["_trackEvent", "copy", "ok"]);

  e.clearSelection();
});

clipboard.on("error", (e) => {
  copyStatus("copy-fail");
  analytics(["_trackEvent", "copy", "nok"]);
  /* eslint-disable no-console */
  console.error("Action:", e.action);
  console.error("Trigger:", e.trigger);
  /* eslint-enable no-console */
});

function display(message) {
  if (message && message.message) {
    const field = document.querySelector("#textarea-script");
    field.value = message.message || "";
  }
}

function show(array, visible) {
  array.forEach((id) => {
    const element = document.getElementById(id);
    visible
      ? element.classList.remove("hidden")
      : element.classList.add("hidden");
  });
}

function enable(array, isEnabled) {
  array.forEach((id) => {
    const element = document.getElementById(id);
    isEnabled
      ? element.classList.remove("disabled")
      : element.classList.add("disabled");
  });
}

function toggle(e) {
  logger(e.target.id);

  if (e.target.id === "record") {
    show(["stop", "pause"], true);
    show(["record", "resume", "scan", "pom"], false);
    enable(["settings-panel"], false);

    $("#sortable").sortable("disable");
  } else if (e.target.id === "pause") {
    show(["resume", "stop", "pom"], true);
    show(["record", "scan", "pause"], false);
    enable(["settings-panel"], false);

    $("#sortable").sortable("disable");
  } else if (e.target.id === "resume") {
    show(["pause", "stop"], true);
    show(["record", "scan", "resume", "pom"], false);
    enable(["settings-panel"], false);

    $("#sortable").sortable("disable");
  } else if (e.target.id === "stop" || e.target.id === "scan") {
    show(["record", "scan"], true); //add pom?
    show(["resume", "stop", "pause"], false);
    enable(["settings-panel"], true);

    $("#sortable").sortable("enable");
  } else if (e.target.id === "pom") {
    //added so only specific buttons will be available during the POM import
    show(["record", "scan", "pom"], true);
    show(["resume", "stop", "pause"], false);
    enable(["settings-panel"], true);
  } else if (e.target.id === "settings") {
    analytics(["_trackEvent", "settings", "⚙️"]);
    document.getElementById("settings-panel").classList.toggle("hidden");
  }

  if (e.canSave === false || e.target.id === "record") {
    document.getElementById("save").disabled = true;
  } else if (
    e.canSave === true ||
    e.target.id === "scan" ||
    e.target.id === "stop"
  ) {
    document.getElementById("save").disabled = false;
  }
  if (e.demo) {
    document.getElementById("demo").checked = e.demo;
  }
  if (e.verify) {
    document.getElementById("verify").checked = e.verify;
  }
}

function busy(e) {
  if (e.isBusy === true || e.isBusy === false) {
    ["scan", "record", "stop", "save", "save", "resume"].forEach((id) => {
      document.getElementById(id).disabled = e.isBusy; //add pom?
    });
  }
}

function operation(e) {
  console.log(e.target.id);
  if (e.target.id === "pom") {
    var input = document.createElement("input");
    input.type = "file";

    input.onchange = (e) => {
      var file = e.target.files[0];
      console.log(file);
      const name = file.name;
      const size = file.size;
      const type = file.type;
      console.log(name, size, type);

      var fr = new FileReader();

      var text = fr.result; //text from pom file
      console.log(text);

      fr.onload = function (e) {
        var text = fr.result; //text from pom file
        //console.log(text);
        const start = "#robotcorder start";
        const stop = "#robotcorder stop";
        const arr = [];
        while (text.indexOf(stop) !== -1) {
          var mySubString = text.substring(
            text.indexOf(start) + start.length,
            text.indexOf(stop)
          );
          text = text.substring(text.indexOf(stop) + stop.length, text.length);
          //console.log(mySubString.substring(0, mySubString.indexOf("\n")));
          const s = mySubString.split("\n");
          var args_stuff = s[1];
          var just_args = args_stuff
            .substring(args_stuff.indexOf(":") +1, args_stuff.length)
            .split(",");

          console.log(just_args);
          var obj_man = {
            keyword: s[2],
            arguments: {
              number: parseInt(just_args[0]),
              types: []
            },
          };
          for (let j=1; j< just_args.length; j++){
            obj_man.arguments.types.push(just_args[j])
          }
          arr.push(obj_man);
          var x = document.getElementById("keywordSelect");
          var option = document.createElement("option");
          option.text = obj_man.keyword;
          option.value = JSON.stringify(obj_man);
          x.add(option);
          /*arr.push(mySubString);
                     console.log(mySubString)
                     console.log("line"); */
        }
        console.log(arr); //adds pom stuff to the console
        //need to get arr to print out within the extension though
      };
      fr.readAsText(file);

      //storage.set({ message: text, operation, canSave: false }); */
    };

    input.click();
  }
  toggle(e);
  const locators = $("#sortable").sortable("toArray", { attribute: "id" });
  host.runtime.sendMessage({ operation: e.target.id, locators }, display);

  analytics(["_trackEvent", e.target.id, "^-^"]);
}
//some of the button stuff is here
function settings(e) {
  const locators = $("#sortable").sortable("toArray", { attribute: "id" });
  const demo = document.getElementById("demo").checked;
  const verify = document.getElementById("verify").checked;
  host.runtime.sendMessage({
    operation: "settings",
    locators,
    demo,
    verify,
  });
  analytics(["_trackEvent", "setting", e.target.id]);
}

function info() {
  host.runtime.sendMessage({ operation: "info" });

  analytics(["_trackEvent", "info", "ℹ️"]);
}

function like() {
  analytics(["_trackEvent", "like", "👍"]);
}




document.addEventListener(
  "DOMContentLoaded",
  () => {
    var appendDiv = document.getElementById("keywordDiv");

    //     activities.addEventListener("onchange", function()
    $('#keywordSelect').change(function(select){
      var killDiv = document.getElementById('tempDiv')
      if (killDiv !== null){
        killDiv.remove()
      }
      var tempDiv = document.createElement('div');
      tempDiv.id = 'tempDiv'
      appendDiv.appendChild(tempDiv)
        console.log(select);
        var activities = document.getElementById("keywordSelect");
        
        var index = activities.selectedIndex
        var reObj = JSON.parse(activities.options[index].value)
        console.log(index,reObj,reObj.arguments.number)
        for( let i=0; i<reObj.arguments.number; i++){
            var btn = document.createElement("textarea");   // Create a <button> element
            btn.innerHTML = `${reObj.arguments.types[i]}`;                   // Insert text
            tempDiv.appendChild(btn);               // Append <button> to <body>
        }
        
    });
    storage.get(
      {
        message: "Record or Scan",
        operation: "stop",
        canSave: false,
        isBusy: false,
        demo: false,
        verify: false,
        locators: [],
      },
      (state) => {
        display({ message: state.message });
        toggle({
          target: { id: state.operation },
          canSave: state.canSave,
          isBusy: state.isBusy,
          demo: state.demo,
          verify: state.verify,
        });
        setTimeout(() => {
          const sortable = document.getElementById("sortable");
          state.locators.forEach((locator) => {
            const li = document.createElement("li");
            li.appendChild(document.createTextNode(locator));
            li.setAttribute("id", locator);
            li.setAttribute("class", "ui-state-default");
            sortable.appendChild(li);
          });
        }, 200);
      }
    );

    debug
      ? document.getElementById("textarea-log").classList.remove("hidden")
      : 0;

    ["record", "resume", "stop", "pause", "save", "scan", "pom"].forEach(
      (id) => {
        //add pom??
        document.getElementById(id).addEventListener("click", operation);
      }
    );

    ["demo", "verify"].forEach((id) => {
      document.getElementById(id).addEventListener("change", settings);
    });

    document.getElementById("like").addEventListener("click", like);
    document.getElementById("info").addEventListener("click", info);
    document.getElementById("settings").addEventListener("click", toggle);

    $("#sortable").sortable({ update: settings });
    $("#sortable").disableSelection();
  },
  false
);

host.storage.onChanged.addListener((changes, _) => {
  for (const key in changes) {
    if (key === "isBusy") busy({ isBusy: changes.isBusy.newValue });
    if (key === "message") display({ message: changes.message.newValue });
  }
});
