// source: commandiq-dev2/scripts/demo/lib/urlbar.js
// vendored 2026-06-29; canonical source is commandiq-dev2/scripts/demo
/**
 * urlbar.js — Playwright-injectable SYNTHETIC browser address bar.
 *
 * Playwright's recordVideo captures the page viewport ONLY — it never records
 * the real OS browser chrome (the actual address bar, tabs, traffic lights).
 * Demo beat B3 needs to show an admin DELETING "/lxp" off the end of the URL
 * to return to the portal, so we draw our OWN browser-chrome bar as a DOM
 * element pinned to the top of the viewport and animate the edit.
 *
 * Design notes / hard requirements (mirror lib/overlay.js conventions):
 *   - Injected onto document.documentElement (the <html>), NOT the React/Expo
 *     root, via page.addInitScript so it re-runs on every document and
 *     survives SPA route changes + full reloads.
 *   - position:fixed; top:0; pointer-events:none; z-index just BELOW the
 *     cursor overlay (2147483646 vs the cursor's 2147483647) so the cyan
 *     arrow draws ON TOP of the address bar text it is editing.
 *   - window.__demoUrlBar exposes:
 *       setUrl(text)                      — instant set (initial paint)
 *       highlightSegment(seg)             — select/highlight a substring (the
 *                                           "/lxp" tail) with a blue selection
 *       deleteHighlighted({ms})           — animate-delete the highlighted run
 *       caretBlink(on)                    — toggle a blinking caret at the end
 *       boxOfSegment(seg)                 — viewport rect of a substring so the
 *                                           Node side can ease the cursor onto
 *                                           the exact "/lxp" glyphs
 *       barRect()                         — rect of the editable URL field
 *   - The bar reserves vertical space by pushing the document down a touch so
 *     it doesn't cover the app header during the brief B3 beat. We do this by
 *     setting documentElement.style.scrollPaddingTop / a top margin on body —
 *     but ONLY while the bar is shown, and we keep it subtle so the portal
 *     still reads clearly.
 *
 * Usage from a capture script:
 *
 *   import { injectUrlBar, ensureUrlBar, setUrl, boxOfSegment,
 *            highlightSegment, deleteHighlighted } from './lib/urlbar.js';
 *   await injectUrlBar(page);
 *   await setUrl(page, 'commandiq.mothandflamevr.com/lxp');
 *   const box = await boxOfSegment(page, '/lxp');   // ease cursor here
 *   await highlightSegment(page, '/lxp');
 *   await deleteHighlighted(page, { ms: 320 });      // bar now reads .../...com
 *
 * Everything inside BROWSER_SCRIPT runs IN the page (no Node APIs).
 */

// Tuning shared by Node + browser sides (documented in one place).
export const URLBAR = {
  height: 44, // px tall chrome bar
  z: 2147483646, // one below the cursor overlay so the arrow draws on top
  deleteMs: 320, // default segment-delete animation duration
};

const BROWSER_SCRIPT = /* js */ `
(function installDemoUrlBar() {
  if (window.__demoUrlBar && document.getElementById('__demo_urlbar_root')) {
    // Re-assert only; keep current text/state across SPA navigations.
    window.__demoUrlBar.ensure();
    return;
  }

  var ROOT_ID = '__demo_urlbar_root';
  var HEIGHT = ${URLBAR.height};
  var Z = ${URLBAR.z};

  // --- Build the chrome bar (browser-frame look) --------------------------
  function build() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'right:0',
      'height:' + HEIGHT + 'px',
      'display:flex', 'align-items:center',
      'gap:10px',
      'padding:0 12px',
      'box-sizing:border-box',
      'background:#2b2f36',                       // browser-chrome grey
      'border-bottom:1px solid rgba(0,0,0,0.35)',
      'box-shadow:0 1px 6px rgba(0,0,0,0.35)',
      'font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif',
      'pointer-events:none',
      'z-index:' + Z,
    ].join(';');

    // Traffic-light dots (macOS-ish), purely decorative.
    var lights = document.createElement('div');
    lights.style.cssText = 'display:flex;gap:7px;align-items:center;flex:0 0 auto;';
    ['#ff5f57', '#febc2e', '#28c840'].forEach(function (c) {
      var d = document.createElement('div');
      d.style.cssText = 'width:11px;height:11px;border-radius:50%;background:' + c + ';';
      lights.appendChild(d);
    });

    // Back / forward / reload glyphs (greyed, decorative).
    var navGlyphs = document.createElement('div');
    navGlyphs.style.cssText = 'display:flex;gap:14px;align-items:center;color:#9aa0a6;font-size:15px;flex:0 0 auto;margin:0 4px;';
    navGlyphs.innerHTML = '<span>\\u2039</span><span>\\u203A</span><span>\\u21BB</span>';

    // The editable URL field (pill).
    var field = document.createElement('div');
    field.id = '__demo_urlbar_field';
    field.style.cssText = [
      'flex:1 1 auto',
      'display:flex', 'align-items:center',
      'height:28px',
      'padding:0 12px',
      'background:#3c4043',
      'border-radius:14px',
      'color:#e8eaed',
      'font-size:13px',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:0.2px',
      'white-space:nowrap', 'overflow:hidden',
    ].join(';');

    // A small lock glyph before the URL.
    var lock = document.createElement('span');
    lock.style.cssText = 'color:#9aa0a6;font-size:11px;margin-right:8px;flex:0 0 auto;';
    lock.textContent = '\\uD83D\\uDD12';

    // The URL text container — we render per-character spans so a substring
    // (the "/lxp" tail) can be precisely highlighted + measured.
    var text = document.createElement('span');
    text.id = '__demo_urlbar_text';
    text.style.cssText = 'display:inline-flex;align-items:center;';

    // Blinking caret element, appended after the text when active.
    var caret = document.createElement('span');
    caret.id = '__demo_urlbar_caret';
    caret.style.cssText = [
      'display:inline-block', 'width:1.5px', 'height:15px',
      'background:#e8eaed', 'margin-left:1px',
      'opacity:0', 'transition:none',
    ].join(';');

    field.appendChild(lock);
    field.appendChild(text);
    field.appendChild(caret);

    root.appendChild(lights);
    root.appendChild(navGlyphs);
    root.appendChild(field);
    document.documentElement.appendChild(root);
    return root;
  }

  var rootEl = build();
  var textEl = document.getElementById('__demo_urlbar_text');
  var caretEl = document.getElementById('__demo_urlbar_caret');
  var caretTimer = null;
  var curUrl = window.__demoUrlBarValue || '';

  // Render the URL as one span PER CHARACTER so any substring is measurable
  // and highlightable by glyph-exact bounding boxes.
  function render(url) {
    curUrl = url;
    window.__demoUrlBarValue = url;
    textEl.innerHTML = '';
    for (var i = 0; i < url.length; i++) {
      var ch = document.createElement('span');
      ch.className = '__demo_urlbar_ch';
      ch.dataset.i = String(i);
      ch.textContent = url[i];
      ch.style.cssText = 'display:inline-block;border-radius:2px;';
      textEl.appendChild(ch);
    }
  }

  // Find the [start,end) char-index range of the LAST occurrence of seg.
  function rangeOf(seg) {
    var idx = curUrl.lastIndexOf(seg);
    if (idx < 0) return null;
    return { start: idx, end: idx + seg.length };
  }

  function chars() {
    return Array.prototype.slice.call(textEl.querySelectorAll('.__demo_urlbar_ch'));
  }

  function highlightSegment(seg) {
    var r = rangeOf(seg);
    if (!r) return false;
    chars().forEach(function (c) {
      var i = parseInt(c.dataset.i, 10);
      if (i >= r.start && i < r.end) {
        c.style.background = '#1a73e8';   // chrome blue selection
        c.style.color = '#ffffff';
      } else {
        c.style.background = '';
        c.style.color = '';
      }
    });
    return true;
  }

  function clearHighlight() {
    chars().forEach(function (c) { c.style.background = ''; c.style.color = ''; });
  }

  // Animate-delete the highlighted segment: shrink the selected glyphs out
  // left-to-right, then commit the new (shorter) URL string.
  function deleteHighlighted(seg, ms) {
    var r = rangeOf(seg);
    if (!r) return Promise.resolve(false);
    var duration = ms == null ? ${URLBAR.deleteMs} : ms;
    var sel = chars().filter(function (c) {
      var i = parseInt(c.dataset.i, 10);
      return i >= r.start && i < r.end;
    });
    // Keep them blue while collapsing.
    sel.forEach(function (c) {
      c.style.transition = 'max-width ' + duration + 'ms ease, opacity ' + duration + 'ms ease, padding ' + duration + 'ms ease';
      c.style.overflow = 'hidden';
      c.style.maxWidth = c.getBoundingClientRect().width + 'px';
    });
    // Next frame: collapse to zero.
    requestAnimationFrame(function () {
      sel.forEach(function (c) { c.style.maxWidth = '0px'; c.style.opacity = '0'; c.style.padding = '0'; });
    });
    return new Promise(function (resolve) {
      setTimeout(function () {
        var next = curUrl.slice(0, r.start) + curUrl.slice(r.end);
        render(next);
        clearHighlight();
        resolve(true);
      }, duration + 30);
    });
  }

  function caretBlink(on) {
    if (caretTimer) { clearInterval(caretTimer); caretTimer = null; }
    if (!on) { caretEl.style.opacity = '0'; return; }
    var vis = true;
    caretEl.style.opacity = '1';
    caretTimer = setInterval(function () {
      vis = !vis;
      caretEl.style.opacity = vis ? '1' : '0';
    }, 530);
  }

  // Viewport rect of a substring (the "/lxp" glyphs) so Node can ease the
  // cursor onto it precisely.
  function boxOfSegment(seg) {
    var r = rangeOf(seg);
    if (!r) return null;
    var cs = chars();
    var first = cs[r.start], last = cs[r.end - 1];
    if (!first || !last) return null;
    var a = first.getBoundingClientRect(), b = last.getBoundingClientRect();
    return { x: a.left, y: a.top, width: (b.right - a.left), height: a.height };
  }

  function barRect() {
    var f = document.getElementById('__demo_urlbar_field');
    if (!f) return null;
    var b = f.getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height };
  }

  // Public API on window.
  window.__demoUrlBar = {
    setUrl: function (u) { render(u); },
    highlightSegment: highlightSegment,
    clearHighlight: clearHighlight,
    deleteHighlighted: deleteHighlighted,
    caretBlink: caretBlink,
    boxOfSegment: boxOfSegment,
    barRect: barRect,
    value: function () { return curUrl; },
    ensure: function () {
      if (!document.getElementById(ROOT_ID)) {
        rootEl = build();
        textEl = document.getElementById('__demo_urlbar_text');
        caretEl = document.getElementById('__demo_urlbar_caret');
        if (curUrl) render(curUrl);
      }
      return true;
    },
  };

  if (curUrl) render(curUrl);
})();
`;

/**
 * injectUrlBar(page)
 * Registers the init script (re-runs on every navigation) AND installs it
 * into the CURRENT document immediately.
 */
export async function injectUrlBar(page) {
  await page.addInitScript(BROWSER_SCRIPT);
  try {
    await page.evaluate(BROWSER_SCRIPT);
  } catch {
    /* about:blank pre-goto — init script covers next navigation. */
  }
}

/** Re-assert the bar node exists; re-inject the whole script if gone. */
export async function ensureUrlBar(page) {
  const present = await page
    .evaluate(() => !!(window.__demoUrlBar && document.getElementById('__demo_urlbar_root')))
    .catch(() => false);
  if (!present) {
    await page.evaluate(BROWSER_SCRIPT).catch(() => {});
  } else {
    await page.evaluate(() => window.__demoUrlBar.ensure()).catch(() => {});
  }
}

/** Instant-set the visible URL text (initial paint). */
export async function setUrl(page, url) {
  await page.evaluate((u) => window.__demoUrlBar && window.__demoUrlBar.setUrl(u), url);
}

/** Highlight (blue-select) the last occurrence of a substring. */
export async function highlightSegment(page, seg) {
  return page.evaluate((s) => window.__demoUrlBar && window.__demoUrlBar.highlightSegment(s), seg);
}

/** Animate-delete the highlighted substring; commits the shorter URL. */
export async function deleteHighlighted(page, seg, { ms = null } = {}) {
  return page.evaluate(
    ([s, m]) => window.__demoUrlBar && window.__demoUrlBar.deleteHighlighted(s, m),
    [seg, ms],
  );
}

/** Toggle the blinking caret at the end of the URL. */
export async function caretBlink(page, on = true) {
  await page.evaluate((o) => window.__demoUrlBar && window.__demoUrlBar.caretBlink(o), on);
}

/** Viewport rect of a substring (e.g. "/lxp") for cursor targeting. */
export async function boxOfSegment(page, seg) {
  return page.evaluate((s) => window.__demoUrlBar && window.__demoUrlBar.boxOfSegment(s), seg);
}

/** Viewport rect of the editable URL field. */
export async function barRect(page) {
  return page.evaluate(() => window.__demoUrlBar && window.__demoUrlBar.barRect());
}

export default {
  URLBAR,
  injectUrlBar,
  ensureUrlBar,
  setUrl,
  highlightSegment,
  deleteHighlighted,
  caretBlink,
  boxOfSegment,
  barRect,
};
