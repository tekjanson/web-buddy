/* global document chrome scanner */

const host = chrome;
let strategyList = [];
const once = {
  once : true
};
/*
var observer = new MutationObserver(recordMutate);
var config = { attributes: true, characterData: true, subtree: true, childList: true};
var config = { attributes: true, characterData: true, subtree: true };
childList: Set to true to observe additions and removals of the target node's child elements (including text nodes).
attributes: Set to true if mutations to target's attributes are to be observed.
characterData: Set to true if mutations to target's data are to be observed.
subtree: Set to true if mutations to not just target, but also target's descendants are to be observed
attributeOldValue: true if recording attributes is set to true and target's attribute value before the mutation
characterDataOldValue: true if recording characterData is set to true and target's data before the mutation
attributeFilter: true if observing an array of attribute local names (without namespace) if not all attribute mutations
*/
host.runtime.sendMessage({ operation: 'load' });

function getTime() {
  return new Date().getTime();
}

function handleByChange(type) {
  return ['text', 'file', 'select'].some(n => type === n);
}

function recordChange(event) {

  const attr = scanner.parseNode(getTime(), event.target, strategyList);

  if (handleByChange(attr.type)) {
    Object.assign(attr, { trigger: 'change' });
    host.runtime.sendMessage({ operation: 'action', script: attr });
  }
}
// i don't love this but i don't know how to do it better, even though there is.
// place your cursor over the area you wish to hover then hit
// alt+h. when you move your mouse again the element under it will be recorded
function recordKeydown(event) {
  
  if (event.altKey  &&  event.key === "h") {  // case sensitive

    document.addEventListener('mousemove', recordClickHover, once);
    function recordClickHover(event) {
    const attr = scanner.parseNode(getTime(), event.target, strategyList);
      attr.type = "hover";
      if (!handleByChange(attr.type)) {
        Object.assign(attr, { trigger: 'hover' });
        host.runtime.sendMessage({ operation: 'action', script: attr });
      }
    }
}
}


function recordClick(event) {

  const attr = scanner.parseNode(getTime(), event.target, strategyList);
  if (!handleByChange(attr.type)) {
    Object.assign(attr, { trigger: 'click' });
    host.runtime.sendMessage({ operation: 'action', script: attr });
  }
}

host.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.operation === 'record') {
    strategyList = request.locators || [];
    strategyList.push('index');
    document.addEventListener('change', recordChange, true);
    document.addEventListener('keydown', recordKeydown, true);
    document.addEventListener('click', recordClick, true);
  } else if (request.operation === 'stop') {
    document.removeEventListener('change', recordChange, true);
    document.removeEventListener('keydown', recordKeydown, true)
    document.removeEventListener('click', recordClick, true);
  } else if (request.operation === 'scan') {
    strategyList = request.locators || [];
    strategyList.push('index');
    document.removeEventListener('change', recordChange, true);
    document.removeEventListener('keydown', recordKeydown, true)
    document.removeEventListener('click', recordClick, true);

    scanner.limit = 1000;
    const array = scanner.parseNodes([], document.body, strategyList);
    host.runtime.sendMessage({ operation: 'action', scripts: array });
  }
});
