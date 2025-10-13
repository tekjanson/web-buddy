const { expect } = require('chai');
const { translator } = require('../../src/translator/mqtt-translator');

describe('mqtt-translator', () => {
  it('generates a JSON actions payload from simple list', () => {
    const input = [
      { type: 'url', path: 'http://example.com' },
      {
        type: 'text', trigger: 'input', path: '//input[@name="email"]', value: 'a@b.c', time: 1
      },
      {
        type: 'button', trigger: 'click', path: '//button[@id="submit"]', time: 2
      }
    ];

    const out = translator.generateOutput(input, 1000, false, false);
    const parsed = JSON.parse(out);
    expect(parsed).to.have.property('type', 'actions');
    expect(parsed).to.have.property('actions');
    expect(parsed.actions).to.be.an('array').with.length(2);
    expect(parsed.actions[0]).to.include({ action: 'input' });
    expect(parsed.actions[1]).to.include({ action: 'click' });
  });
});
