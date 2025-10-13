(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    // CommonJS
    module.exports.GeminiBridge = factory();
  } else {
    // Browser globals
    root.GeminiBridge = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  /* mqtt/gemini-bridge.js
     Bridge for Google Gemini API.
  */

  function noOp() {}
  return {
    apiKey: null,
    connected: false,
    init(cfg) {
      this.cfg = cfg || {};
      this.onConnect = cfg.onConnect || noOp;
      this.onError = cfg.onError || noOp;
      this.onSuggestion = cfg.onSuggestion || noOp; // for publishActions

      if (cfg.apiKey) {
        this.apiKey = cfg.apiKey;
        this.connected = true;
        this.onConnect();
        console.debug('[GeminiBridge] initialized with API key.');
      } else {
        this.onError('API key not provided.');
        console.warn('[GeminiBridge] API key not provided.');
      }
    },

    async _callApi(prompt) {
      if (!this.connected || !this.apiKey) {
        console.warn('[GeminiBridge] Not connected or API key not set.');
        throw new Error('Gemini Bridge not initialized.');
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
      const body = { contents: [{ parts: [{ text: prompt }] }] };

      // In MV3, we delegate the fetch call to the background script,
      // which will use an offscreen document to avoid browser-added headers.
      return new Promise((resolve, reject) => {
        // The background script will listen for this message.
        chrome.runtime.sendMessage({
          operation: 'gemini-api-call',
          target: 'background',
          url,
          body
        }, (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response.success) {
            try {
              const candidate = response.data.candidates[0];
              const text = candidate.content.parts[0].text;
              resolve(text || '');
            } catch (e) {
              const errorMessage = (response.data && response.data.error && response.data.error.message) || 'Could not parse Gemini response.';
              reject(new Error(errorMessage));
            }
          } else {
            const errorMessage = (response.error && response.error.message) || 'Unknown error from background script.';
            reject(new Error(errorMessage));
          }
        });
      });
    },

    async chat(prompt) {
      return this._callApi(prompt);
    },

    async publishActions(prompt) {
        // This is for recorded actions. The response should be a suggestion.
        const script = await this._callApi(prompt);
        const suggestion = {
            type: 'suggestion',
            script: script
        };
        this.onSuggestion(suggestion);
    },

    stop() {
      this.apiKey = null;
      this.connected = false;
      console.debug('[GeminiBridge] stopped.');
    }
  };
}));
