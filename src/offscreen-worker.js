/*
 * offscreen-worker.js
 * This script runs in the offscreen document. It listens for messages from the
 * background service worker, performs network requests (like Gemini API calls),
 * and sends the results back.
 */

/* global chrome */

const host = (typeof chrome !== 'undefined') ? chrome : (typeof browser !== 'undefined' ? browser : {});

function debug(...args) {
  console.debug('[Robotcorder Offscreen]', ...args);
}

async function handleMessage(request) {
  if (!request || !request.operation) return;
  debug('Received message:', request.operation, 'callId:', request.callId);

  if (request.operation === 'gemini-api-call' || request.operation === 'gemini-api-test') {
    const { callId, url, body, apiKey } = request;
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const finalUrl = request.operation === 'gemini-api-test' ? testUrl : url;

    try {
      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
      };
      // For a simple test, we just need to list models, which is a GET.
      if (request.operation === 'gemini-api-test') {
        fetchOptions.method = 'GET';
        delete fetchOptions.body;
      }

      const response = await fetch(finalUrl, fetchOptions);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ? data.error.message : `HTTP error! status: ${response.status}`);

      host.runtime.sendMessage({ type: 'gemini-api-response', success: true, callId, data });
    } catch (error) {
      debug('API call failed:', error);
      host.runtime.sendMessage({ type: 'gemini-api-response', success: false, callId, error: { message: error.message } });
    }
  }
}

host.runtime.onMessage.addListener(handleMessage);

// Signal to the background script that the offscreen document is ready.
host.runtime.sendMessage({ type: 'offscreen-ready' });
debug('Offscreen document ready and listeners attached.');