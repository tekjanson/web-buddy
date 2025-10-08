/* global builder locator classifier */

const scanner = {
  limit: 1000,

  parseNodes(array, root, attributesArray) {
    this.limit = this.limit - 1;
    if ((this.limit <= 0) || (root === undefined)) return [];

    const hash = (typeof classifier === 'function') ? classifier(root) : (classifier.classify ? classifier.classify(root) : null);

    if (hash !== null) {
      const tree = builder.build(root, attributesArray, []);
      Object.assign(hash, {
        path: locator.build(tree, root, hash.type, attributesArray)
      });
      array.push(hash);
    }

    const children = root.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (children[i].nodeType === 1) { // element node
        this.parseNodes(array, children[i], attributesArray);
      }
    }
    return array;
  },

  parseNode(time, node, attributesArray) {
    if (node !== undefined) {
      // identifying what type of thing we are dealing with
      // TODO this could be improved i think to improve xpath return

      const hash = (typeof classifier === 'function') ? classifier(node) : (classifier.classify ? classifier.classify(node) : { type: 'default' });

      const tree = builder.build(node, attributesArray, []);

      Object.assign(hash, {
        time,
        path: locator.build(tree, node, hash.type, hash)
      });
      return hash;
    }
    return {};
  }
};

if (typeof exports !== 'undefined') module.exports.scanner = scanner;
