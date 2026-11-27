// Runs at document_start, before YouTube's own scripts. YouTube listens for
// its shortcuts on window in the capture phase too, and listeners on the same
// target and phase run in registration order, so registering here is the only
// way for the panel's shortcuts (handled in content.js) to be seen first.
(() => {
  "use strict";
  if (globalThis.__ytlEarlyKeys) return;
  globalThis.__ytlEarlyKeys = true;
  const forward = (event) => globalThis.__ytlKeys?.(event);
  for (const type of ["keydown", "keyup", "keypress"]) window.addEventListener(type, forward, { capture: true });
})();
