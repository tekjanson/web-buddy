/*
 * background/offscreen.js
 * Manages the offscreen document for making Gemini API calls.
 */

// We store pending callbacks keyed by a generated callId so the
// offscreen document can post back responses asynchronously.
var offscreenApiCallCallbacks = new Map();

// Track whether the offscreen document has signaled readiness
var offscreenReady = false;

function setOffscreenReady(isReady) {
  offscreenReady = isReady;
}

function waitForOffscreenReady(timeout = 3000) {
  return new Promise((resolve) => {
    if (offscreenReady) return resolve(true);
    const start = Date.now();
    const interval = setInterval(() => {
      if (offscreenReady) {
        clearInterval(interval);
        return resolve(true);
      }
      if (Date.now() - start > timeout) {
        clearInterval(interval);
        return resolve(false);
      }
    }, 50);
  });
}

async function setupOffscreenDocument() {
  // If the host doesn't support the offscreen API, just return (caller will
  // handle failures). Many tests and some browsers may not implement it.
  if (!host.offscreen || typeof host.offscreen.createDocument !== 'function') return;

  try {
    // Detailed logging so we can trace why offscreen creation may fail at runtime.
    bgDebug('setupOffscreenDocument: host.offscreen exists, attempting to ensure offscreen document');
      bgDebug('setupOffscreenDocument: hasDocument available?', typeof host.offscreen.hasDocument === 'function');
      if (typeof host.offscreen.hasDocument === 'function') {
        try {
          let has = host.offscreen.hasDocument && host.offscreen.hasDocument();
          if (has && typeof has.then === 'function') {
            try { has = await has; } catch (e) { bgDebug('setupOffscreenDocument: hasDocument() promise rejected', e && e.message ? e.message : e); has = false; }
          }
          bgDebug('setupOffscreenDocument: hasDocument() =>', has);
          if (has) return;
        } catch (e) {
          bgDebug('setupOffscreenDocument: hasDocument() threw, will attempt createDocument', e && e.message ? e.message : e);
          // continue to attempt createDocument
        }
      }

      const offscreenUrl = (host.runtime && typeof host.runtime.getURL === 'function') ? host.runtime.getURL('src/offscreen.html') : 'src/offscreen.html';
      bgDebug('setupOffscreenDocument: offscreen url resolved to', offscreenUrl);

      // Retry createDocument a few times to handle transient failures in some environments.
      const maxAttempts = 3;
      let lastErr = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          bgDebug('setupOffscreenDocument: createDocument attempt', attempt);
          await host.offscreen.createDocument({
            url: offscreenUrl,
            reasons: ['DOM_PARSER'],
            justification: 'Perform Gemini API calls from offscreen document'
          });
          bgDebug('setupOffscreenDocument: createDocument succeeded on attempt', attempt);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          bgDebug('setupOffscreenDocument: createDocument attempt failed', attempt, e && e.message ? e.message : e);
          // small backoff before retrying
          await new Promise((res) => setTimeout(res, 250 * attempt));
        }
      }

      if (lastErr) {
        // Re-throw so callers can handle the failure; we've logged the attempts.
        throw lastErr;
      }
  } catch (e) {
    // If createDocument fails because the document already exists, it's fine.
    // Re-throw other errors so callers can respond with useful messages.
    try {
        if (typeof host.offscreen.hasDocument === 'function') {
          const has = host.offscreen.hasDocument && host.offscreen.hasDocument();
          if (has) return;
        }
    } catch (ee) {}
    throw e;
  }
}