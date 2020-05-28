/* global document XPathResult */

const locator = {
  build(tree, element, type, hash) {
    // getting item
    const item = tree[0];
    // getting tag of element
    const tag = Object.keys(item)[0];
    // extra detailed information is from hash
    const value = hash;
    const p = item[tag].reduce(
      (subpath, attr) => (
        // get subpath for path, builds as it loops
        subpath === '' ? this._getSubpath(subpath, attr, tag, value) : subpath
      ),
      ''
    );
    const path = `/${p}`;
    // if there is no more elelments the path is done
    if (!element) return path;
    // if we have id or for or name the path is done
    if (this._found(['@id', '@for'], path)) return path;
    if (this._found(['@name'], path) && this._found(['select'], type)) return path;

    const { count, index } = this._getIndex(path, element);
    return ((count > 1) && (index > 1)) ? `xpath=(${path})[${index}]` : path;
  },

  _found(attributes, path) {
    return attributes.some(attr => path.includes(attr));
  },

  _getIndex(path, element) {
    let index = 1; // 1 - unique tag
    let count = 1; // 1 - unique element

    let node;
    const nodes = document.evaluate(`.${path}`, document.body, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    while (node = nodes.iterateNext()) {
      if (node === element) { index = count; }
      count += 1;
    }
    return { count, index };
  },

  _getSubpath(subpath, attr, tag, hash) {
    if (attr.id != null) return `/${tag}[@id="${attr.id}"]`;
    if (attr.name != null) return `/${tag}[@name="${attr.name}"]`;
    // added and reorded to include text search
    if (hash.value != null && hash.type == "containsText") return `/${tag}[contains(text(), "${hash.value}")]`;
    if (hash.value != null && hash.type == "parentContainsText" &&  (attr.class != null) && (attr.class.length > 0)) return `/${hash.parentTag.tagName.toLowerCase()}[contains(text(), "${hash.value}")]//../${tag}[@class="${attr.class}"]`;
    if (hash.value != null && hash.type == "parentParentContainsText") return `/${tag}[contains(text(), "${hash.value}")]`;
    
    
    if ((attr.class != null) && (attr.class.length > 0)) return `/${tag}[@class="${attr.class}"]`;
    if (attr.for != null) return `/${tag}[@for="${attr.for}"]`;
    if (attr.title != null) return `/${tag}[@title="${attr.title}"]`;
    if (attr.href != null) return `/${tag}[@href="${attr.href}"]`;
    if (attr.index != null) return `/${tag}`;
    return '';
  }
};

if (typeof exports !== 'undefined') exports.locator = locator;
