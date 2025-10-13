/* eslint-disable guard-for-in */
function classifier(element) {
  let hash = null;
  const tag = element.tagName.toLowerCase();
  if (tag === 'input') {
    switch (element.type) {
      case 'password':
        hash = { type: 'text', value: '***' };
        break;
      case 'radio':
        hash = { type: 'radio', value: element.value };
        break;
      case 'checkbox':
        hash = { type: 'checkbox', value: element.checked };
        break;
      case 'file':
        hash = { type: 'file', value: element.value };
        break;
      case 'email':
      case 'tel':
      case 'url':
      case 'number':
      case 'search':
      case 'text':
      case 'date':
      case 'datetime-local':
      case 'week':
      case 'month':
      case 'color':
        hash = { type: 'text', value: element.value };
        break;
      case 'submit':
      case 'image':
      case 'range':
      case 'reset':
        hash = { type: element.type };
        break;
      case 'hidden':
      default:
        return null;
    }
  } else if (tag === 'textarea') {
    hash = { type: 'text', value: element.value };
  } else if (tag === 'select') {
    hash = { type: 'select', value: element.value };
  } else if (tag === 'a') {
    hash = { type: 'a', value: element.href };
  } else if (element.innerText != null && element.innerText !== '') {
    hash = { type: 'containsText', value: element.innerText.substring(0, 15) };
  } else if (element.parentNode && element.parentNode.textContent != null && element.parentNode.textContent !== '') {
    const pTag = _searchForText(element.parentNode, element.parentNode.textContent);
    hash = { type: 'parentContainsText', value: element.parentNode.textContent.substring(0, 15), parentTag: pTag };
  } else if (element.parentNode && element.parentNode.parentNode && element.parentNode.parentNode.textContent != null && element.parentNode.parentNode.textContent !== '') {
    const pTag = _searchForText(element.parentNode.parentNode, element.parentNode.parentNode.textContent);
    hash = { type: 'parentParentContainsText', value: element.parentNode.parentNode.textContent.substring(0, 15), parentTag: pTag };
  }

  return hash;
}

function _searchForText(element, elementText) {
  const aTags = element;
  const searchText = elementText;
  let found;
  for (let i = 0; i < aTags.children.length; i++) {
    if (aTags.children[i].textContent == searchText.toString()) {
      found = aTags.children[i];
      break;
    }
  }
  return found;
}

classifier._searchForText = _searchForText;

if (typeof exports !== 'undefined') module.exports.classifier = classifier;
