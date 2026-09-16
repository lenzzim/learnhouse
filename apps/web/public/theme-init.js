// Runs synchronously in <head>, before <body> paints, so the dark theme never
// flashes white on load. Same reason and same mechanism as dir-init.js.
//
// The server cannot do this: the viewer's choice lives in localStorage, which
// is client-only, so the class has to be applied before first paint on the
// client.
//
// Dark is the DEFAULT here (matches discipulei.com.br). Light is opt-in and is
// only applied when the viewer explicitly picked it. A viewer who never touched
// the switch always gets dark, including on a brand-new device.
(function () {
  var STORAGE_KEY = 'lh_theme';
  var theme = 'dark';

  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch { /* private mode / sandboxed iframe */ }

  var el = document.documentElement;
  if (theme === 'dark') {
    el.classList.add('dark');
  } else {
    el.classList.remove('dark');
  }
  el.style.colorScheme = theme;
})();
