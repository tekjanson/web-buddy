/* Tests for popup AI JSON extraction helper */
const { expect } = require('chai');
require('./setup');
// Load the popup AI module so it attaches helpers to window in the test DOM
require('../src/popup-ai.js');

describe('popup ai extraction', () => {
  it('extracts fenced ```json block', () => {
    const txt = 'Some text\n```json\n[ {"action":"click","selector":"#a"} ]\n```\nThanks';
    const res = window._wb_extractJsonFromText(txt);
    expect(res).to.be.a('string');
    const parsed = JSON.parse(res);
    expect(parsed).to.be.an('array');
    expect(parsed[0].action).to.equal('click');
  });

  it('extracts inline JSON array', () => {
    const txt = 'Here is actions: [{"action":"input","selector":"input[name=qq]","value":"x"}] end';
    const res = window._wb_extractJsonFromText(txt);
    expect(res).to.be.a('string');
    const parsed = JSON.parse(res);
    expect(parsed[0].action).to.equal('input');
  });

  it('returns inner fenced text when non-JSON fenced block present', () => {
    const txt = 'No json here, just words and code: ```text\nhello\n```';
    const res = window._wb_extractJsonFromText(txt);
    expect(res).to.be.a('string');
    expect(res).to.equal('text\nhello');
  });
});
