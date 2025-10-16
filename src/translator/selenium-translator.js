/* selenium-translator.js
   Simple Selenium (WebDriverJS) translator producing a test scaffold using
   async/await and the WebDriver API. Exports as `translators.selenium` in the
   browser and `module.exports.translator` for CommonJS.
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.translator = factory();
  } else {
    try {
      root.translators = root.translators || {};
      root.translators.selenium = factory();
    } catch (e) {}
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeJs(s) { return String(s || '').replace(/'/g, "\\'"); }

  function xpathLocator(xpath) { return `By.xpath('${escapeJs(xpath)}')`; }

  function buildAction(a) {
    if (!a || !a.type) return '';
    switch (a.type) {
      case 'url': return `await driver.get('${escapeJs(a.path || '')}');`;
      case 'click': return `await (await driver.findElement(${xpathLocator(a.path)})).click();`;
      case 'change': return `await (await driver.findElement(${xpathLocator(a.path)})).sendKeys('${escapeJs(a.value || '')}');`;
      case 'select': return `// Select actions may need helper code; consider using sendKeys or Selenium Select class`;
      case 'hover': return `// Hover not implemented for Selenium translator; consider actions().move()`;
      default: return `// unsupported action: ${a.type}`;
    }
  }

  return {
    generateOutput(list = []) {
      try {
        if (!Array.isArray(list) || list.length === 0) return '';
        const header = [
          "const { Builder, By, until } = require('selenium-webdriver');",
          "(async function main() {",
          "  const driver = await new Builder().forBrowser('chrome').build();",
          "  try {"
        ];
        const footer = [
          "  } finally {",
          "    await driver.quit();",
          "  }",
          "})();"
        ];
        const body = [];
        list.forEach((a) => {
          const l = buildAction(a);
          if (l) body.push('    ' + l);
        });
        return header.concat(body, footer).join('\n');
      } catch (e) { return ''; }
    },
    generateFile(list = [], maxLength, demo, verify, libSource = []) {
      return this.generateOutput(list, maxLength, demo, verify);
    }
  };
}));
