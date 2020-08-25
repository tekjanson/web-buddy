const debug = false;
const host = chrome;

var input = document.createElement("input");
input.type = "file";

input.onchange = (e) => {
  var file = e.target.files[0];
  const name = file.name;
  const size = file.size;
  const type = file.type;

  var fr = new FileReader();

  var text = fr.result; //text from pom file

  fr.onload = function (e) {
    var text = fr.result; //text from pom file
    const start = "#robotcorder start";
    const stop = "#robotcorder stop";
    const arr = [];
    while (text.indexOf(stop) !== -1) {
      var mySubString = text.substring(
        text.indexOf(start) + start.length,
        text.indexOf(stop)
      );
      text = text.substring(text.indexOf(stop) + stop.length, text.length);
      const s = mySubString.split("\n");
      var args_stuff = s[1];
      var just_args = args_stuff
        .substring(args_stuff.indexOf(":") + 1, args_stuff.length)
        .split(",");

      var obj_man = {
        keyword: s[2],
        arguments: {
          number: parseInt(just_args[0]),
          types: [],
        },
      };
      for (let j = 1; j < just_args.length; j++) {
        obj_man.arguments.types.push(just_args[j]);
      }
      arr.push(obj_man);
      // var x = document.getElementById("keywordSelect");
      // var option = document.createElement("option");
      // option.text = obj_man.keyword;
      // option.value = JSON.stringify(obj_man);
      // x.add(option);
      /*arr.push(mySubString);
                 console.log(mySubString)
                 console.log("line"); */
    }
    //need to get arr to print out within the extension though

    chrome.storage.local.set({ pom: JSON.stringify(arr) }, function () {
      //  Data's been saved boys and girls, go on home
    });
    // storage.set({ message: 'pom', opperation:  });
    window.close();
  };
  fr.readAsText(file);

  //storage.set({ message: text, operation, canSave: false }); */
};
document.body.append(input);
// input.click();

function pomSave() {
  var ta = document.getElementById("tempDiv").getElementsByTagName("textarea");
  var activities = document.getElementById("keywordSelect");
  var index = activities.selectedIndex;
  var arrGuments = [];
  arrGuments.push(JSON.parse(activities.options[index].value).keyword);
  for (let element of ta) {
    arrGuments.push(element.value);
  }

  host.runtime.sendMessage({ operation: "pomer", results: arrGuments });
}

chrome.storage.local.get(/* String or Array */ ["pom"], function (items) {
  //  items = [ { "phasersTo": "awesome" } ]
  var arr = JSON.parse(items.pom);
  var x = document.getElementById("keywordSelect");

  for (let i = 0; i < arr.length; i++) {
    var option = document.createElement("option");
    option.text = arr[i].keyword;
    option.value = JSON.stringify(arr[i]);
    x.add(option);
  }

  x.addEventListener("change", function (select) {
    // chrome.storage.local.set({
    //   message: 'record',
    //   operation: 'record',
    //   canSave: false,
    // });
    var appendDiv = document.getElementById("keywordDiv");
    var killDiv = document.getElementById("tempDiv");
    if (killDiv !== null) {
      killDiv.remove();
    }
    var tempDiv = document.createElement("div");
    tempDiv.id = "tempDiv";
    appendDiv.appendChild(tempDiv);
    var activities = document.getElementById("keywordSelect");

    var index = activities.selectedIndex;
    var reObj = JSON.parse(activities.options[index].value);
    for (let i = 0; i < reObj.arguments.number; i++) {
      var btn = document.createElement("textarea"); // Create a <button> element
      btn.id = `${reObj.keyword}-${i}`
      // btn.innerText = `${reObj.arguments.types[i]}`; // Insert text
      btn.value = `${reObj.arguments.types[i]}`; // Insert text
      if (reObj.arguments.types[i] === "element") {
        btn.addEventListener("click", (eventx) => {
          host.runtime.sendMessage({ operation: "pomerSelect", btnId: `${reObj.keyword}-${i}` });
        });
      }
      tempDiv.appendChild(btn); // Append <button> to <body>
    }
    var submitButton = document.createElement("input");
    submitButton.type = "button";
    submitButton.value = "submit";
    submitButton.textContent = "submit";
    tempDiv.appendChild(submitButton);
    submitButton.addEventListener("click", pomSave);
  });
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.msg === "element") {
    //  To do something

    var btn = document.getElementById(request.data.elementState.request.btnId)
    btn.value=request.data.request.script.path
    // btn.value = event.target;


  }
});
