// helper to require extension popup.js in Node by providing a minimal chrome shim
global.chrome = { runtime: { lastError: null, sendMessage: function(){} }, storage: { local: { get: function(){}, set: function(){} }, onChanged: { addListener: function(){} } }, tabs: { query: function(){}, sendMessage: function(){} }, windows: { create: function(){}, remove: function(){} }, runtime: { getURL: function(p){ return p; } } };
// Minimal ClipboardJS shim
global.ClipboardJS = function() { return { on: function(){} }; };
try {
  require('./src/popup.js');
  console.log('popup.js required ok');
} catch (e) {
  console.error('require failed', e && e.stack ? e.stack : e);
  process.exit(1);
}
