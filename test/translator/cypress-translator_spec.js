const { expect } = require('chai');
const { translator } = require('../../src/translator/cypress-translator');

describe('cypress-translator', () => {
  it('generates Cypress commands for simple actions', () => {
    const input = [
      { type: 'url', path: 'http://example.com', title: 'Example' },
      { type: 'text', trigger: 'input', path: "//input[@name='email']", value: 'a@b.c', time: 1 },
      { type: 'button', trigger: 'click', path: "//button[@id='submit']", time: 2 }
    ];

    const out = translator.generateOutput(input, 1000, false, false);
    expect(out).to.be.a('string');
    expect(out).to.include("cy.visit('http://example.com');");
    expect(out).to.include("cy.xpath('//input[@name=\\'email\\']').clear().type('a@b.c');");
    expect(out).to.include("cy.xpath('//button[@id=\\'submit\\']').click();");
  });

  it('includes verify commands when verify=true', () => {
    const input = [
      { type: 'url', path: 'http://example.com' },
      { type: 'button', trigger: 'click', path: "//button[@id='ok']" }
    ];
    const out = translator.generateOutput(input, 1000, false, true);
    expect(out).to.include("cy.xpath('//button[@id=\\'ok\\']').should('exist');");
  });

  it('includes wait when demo=true', () => {
    const input = [
      { type: 'url', path: 'http://example.com' },
      { type: 'button', trigger: 'click', path: "//button[@id='ok']" }
    ];
    const out = translator.generateOutput(input, 1000, true, false);
    expect(out).to.include("cy.wait(");
  });

  it('generateFile returns a scaffolded test', () => {
    const input = [ { type: 'url', path: 'http://example.com', title: 'Example Test' } ];
    const file = translator.generateFile(input, 1000, false, false, []);
    expect(file).to.be.a('string');
    expect(file).to.include("describe('Example Test'");
    expect(file).to.include("it('Example Test test'");
  });
});
