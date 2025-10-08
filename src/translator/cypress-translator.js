const map = {
  url: { keyword: "cy.visit('", keyword2: "')" },
  text: { keyword: "cy.xpath('", value: 'y', keyword2: "')" },
  file: { keyword: "cy.xpath('", value: 'y', keyword2: "')" },
  hover: { keyword: "cy.xpath('", keyword2: "').trigger('mouseover')" },
  button: { keyword: "cy.xpath('", keyword2: "').click()" },
  a: { keyword: "cy.xpath('", keyword2: "').click()" },
  select: { keyword: "cy.xpath('", select: 'y', keyword2: "')" },
  // radio:  { keyword: 'Select Radio Button', value: 'y' },
  demo: { keyword: 'cy.wait(', keyword2: "')" },
  // verify: { keyword: 'Wait Until Page Contains Element',keyword2: "')" },
  default: { keyword: "cy.xpath('", keyword2: "').click()" }
};

if (typeof translator === 'undefined') {
  var translator = {
    generateOutput(list, length, demo, verify) {
      const events = this._generateEvents(list, length, demo, verify);

      return events.join('\n');
    },

    generateFile(list, length, demo, verify, source) {
      let events = this._generateEvents(list, length, demo, verify);
      let libs = '';
      for (let i = 0; i < source.length; i++) {
        libs += `\nLibrary           ${source[i]}`;
      // Do something
      }

      events = events.reduce((a, b) => `${a}    ${b}\n`, '');
      return `
    ${libs}
    describe('${list[0].title}', () => {
      it('${list[0].title} test', () => {
        ${events}
      })
    })
    `;
    // return '*** Settings ***'
    //   + `\nDocumentation     A test suite with a single test for ${list[0].title}`
    //   + "\n...               Created by hats' Robotcorderv2"
    //   + '\nLibrary           Selenium2Library    timeout=10'
    //   + `\n${libs}`
    //   + '\n\n*** Variables ***'
    //   + '\n${BROWSER}    chrome'
    //   + '\n${SLEEP}    3'
    //   + '\n\n*** Test Cases ***'
    //   + `\n${list[0].title} test`
    //   + `\n${events}`
    //   + '\n    Close Browser';
    },

    _generatePath(attr) {
      let path = '';
      if (attr.type === 'pomer') {
        path = attr.trigger;
        for (let i = 0; i < attr.arguments.length; i++) {
          path += `    ${attr.arguments[i]} `;
        }
      } else {
        const type = map[attr.type] || map.default;
        path = type.keyword;

        path += attr.type === 'url' ? `${attr.path}` : `${attr.path.replace("'", "\\'")}`;
        path += attr.value && type.value ? `').type('${attr.value}` : '';
        path += attr.select && type.value ? `').select('${attr.value}` : '';
        path += type.keyword2;
      }
      return path;
    },

    _generateDemo(demo) {
      return demo ? map.demo.keyword : '';
    },

    _generateVerify(attr, verify) {
      return attr.path && verify ? `${map.verify.keyword}    ${attr.path}` : '';
    },

    _generateEvents(list, length, demo, verify) {
      let event = null;
      const events = [];
      for (let i = 0; i < list.length && i < length; i++) {
        if (i > 0) {
          event = this._generateVerify(list[i], verify);
          event && events.push(event);
        }
        event = this._generatePath(list[i]);
        event && events.push(event);
        event = this._generateDemo(demo);
        event && events.push(event);
      }
      return events;
    }
  };
}

if (typeof exports !== 'undefined') exports.translator = translator;
