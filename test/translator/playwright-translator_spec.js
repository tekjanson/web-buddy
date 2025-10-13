const { expect } = require('chai');

describe('playwright-translator', () => {
  it('generates a Playwright script for a simple list', () => {
    const t = require('../../src/translator/playwright-translator.js').translator;
    const list = [{ type: 'url', path: 'https://example.com' }, { type: 'click', path: '/html/body/a[1]' }];
    const out = t.generateOutput(list);
    expect(out).to.be.a('string');
    expect(out.length).to.be.greaterThan(0);
    expect(out).to.include("page.goto");
  });
});
