const { expect } = require('chai');
const executor = require('../src/executor');

describe('executor', () => {
  it('maps a recorded list to canonical commands', () => {
    const list = [
      { type: 'url', path: 'https://example.com' },
      { type: 'click', path: '/html/body/a[1]' },
      { type: 'text', path: '/html/body/input[1]', value: 'hello' },
      { type: 'select', path: '/html/body/select[1]', value: '2' },
      { type: 'hover', path: '/html/body/div[1]' }
    ];
    const cmds = executor.generateCommands(list);
    expect(cmds).to.be.an('array');
    expect(cmds.length).to.equal(5);
    expect(cmds[0].action).to.equal('navigate');
    expect(cmds[1].action).to.equal('click');
    expect(cmds[2].action).to.equal('input');
    expect(cmds[3].action).to.equal('select');
    expect(cmds[4].action).to.equal('hover');
  });
});
