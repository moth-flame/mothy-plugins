// source: commandiq-dev2/scripts/demo/lib/overlay.js
// vendored 2026-06-29; canonical source is commandiq-dev2/scripts/demo
/**
 * overlay.js — Playwright-injectable synthetic-pointer overlay.
 *
 * This is the keystone of the CommandMRO demo video. Real OS cursors don't
 * record cleanly in Playwright's recordVideo, so we draw our OWN cursor as a
 * DOM element and animate it. Two skins:
 *
 *   - 'arrow'  (portal / desktop) — a sharp cyan arrow, expanding-ring click.
 *   - 'finger' (tablet / touch)   — a translucent amber dot, tap-ripple, lead trail.
 *
 * Design notes / hard requirements (locked UX spec):
 *   - Injected into document.documentElement (the <html>), NOT the React/Expo
 *     root, so SPA re-renders never wipe the cursor. position:fixed +
 *     pointer-events:none + max z-index so it floats above everything and
 *     never eats real clicks.
 *   - window.__demoCursor exposes async moveTo(x,y,ms) (eased cubic
 *     ease-in-out tween via rAF) + click()/tap() pulse animations.
 *   - Motion contract: never teleport, always ease, >=250ms dwell before a
 *     click, ~400ms hold after. The JS-side moveToSelector() helper enforces
 *     this and drives BOTH the visual cursor AND the real Playwright click,
 *     so the recording matches the actual interaction.
 *   - CLICK RING / TAP RIPPLE FIRES ONLY ON A REAL CLICK. The expanding ring
 *     (pulse) is gated strictly behind the click action — it never fires on
 *     hover, dwell, or plain movement. moveToSelector() only pulses when
 *     realClick is true; pointing at a non-interactive element (realClick:
 *     false) moves + dwells + holds but does NOT pulse. This keeps the cursor
 *     from ever looking like it's "clicking" something it isn't.
 *   - Re-assert the node after navigations (addInitScript re-runs on every
 *     new document; ensureOverlay() re-injects defensively if it's gone).
 *
 * Usage from a capture script:
 *
 *   import { injectOverlay, moveToSelector, clickAt, dwell } from './lib/overlay.js';
 *   await injectOverlay(page, 'arrow');     // call before navigation
 *   await page.goto(url);
 *   await moveToSelector(page, '#start-btn', { skin: 'arrow' });
 *
 * Everything below `BROWSER_SCRIPT` runs INSIDE the page (no Node APIs).
 * The exported functions run in Node and marshal calls across via
 * page.evaluate / page.addInitScript.
 */

// Default tuning shared by Node + browser sides. Kept in one object so the
// motion contract is documented in exactly one place.
export const MOTION = {
  dwellBeforeClickMs: 280, // >=250ms required by spec
  holdAfterClickMs: 420, // ~400ms required by spec
  defaultMoveMs: 900, // arrow default; finger is multiplied below
  fingerMoveMultiplier: 1.15, // finger tweens ~15% slower
};

/**
 * The full browser-side overlay implementation, as a string. We inject it
 * with page.addInitScript so it runs on EVERY document (initial + each
 * navigation), guaranteeing the cursor survives SPA route changes and full
 * page loads alike. It's a string (not a function ref) so we can interpolate
 * the chosen skin at inject time without leaking Node scope.
 */
const BROWSER_SCRIPT = /* js */ `
(function installDemoCursor(skin) {
  // Idempotent: addInitScript re-runs per document, but a soft SPA nav does
  // not create a new document, so guard against double-install in one doc.
  if (window.__demoCursorSkin === skin && window.__demoCursor && document.getElementById('__demo_cursor_root')) {
    return;
  }
  window.__demoCursorSkin = skin;

  var ROOT_ID = '__demo_cursor_root';

  // --- Skin palettes -------------------------------------------------------
  var SKINS = {
    arrow: {
      kind: 'arrow',
      color: '#38bdf8',
      ring: '#38bdf8',
      ringMaxR: 28,
      ringMs: 350,
      size: 26,          // arrow bounding box px
      moveMult: 1.0,
      trail: false,
    },
    finger: {
      kind: 'finger',
      color: '#fbbf24',
      ring: '#fbbf24',
      ringStartR: 22,
      ringMaxR: 60,
      ringMs: 400,
      size: 44,          // amber dot diameter px
      dotOpacity: 0.55,
      ringOpacity: 0.85,
      moveMult: 1.15,    // tablet finger is ~15% slower
      trail: true,
    },
  };
  var cfg = SKINS[skin] || SKINS.arrow;

  // --- Build the DOM, attached to <html> not <body>/#root -----------------
  function build() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;

    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = [
      'position:fixed',
      'left:0', 'top:0',
      'width:0', 'height:0',
      'pointer-events:none',
      'z-index:2147483647',        // max 32-bit signed; above any app layer
      'margin:0', 'padding:0', 'border:0',
    ].join(';');

    // The moving pointer wrapper. We translate THIS; children are drawn
    // relative to it so click rings / ripples stay centered on the tip.
    var ptr = document.createElement('div');
    ptr.id = '__demo_cursor_ptr';
    ptr.style.cssText = [
      'position:fixed',
      'left:0', 'top:0',
      'transform:translate(-100px,-100px)', // start off-screen
      'transition:none',
      'will-change:transform',
      'pointer-events:none',
    ].join(';');

    // The visible glyph (arrow SVG or amber dot).
    var glyph = document.createElement('div');
    glyph.id = '__demo_cursor_glyph';
    glyph.style.cssText = 'position:absolute;pointer-events:none;';

    if (cfg.kind === 'arrow') {
      // Sharp arrow: cyan stroke, white fill, drop shadow. Tip at (0,0).
      glyph.innerHTML =
        '<svg width="' + cfg.size + '" height="' + cfg.size + '" viewBox="0 0 24 24" ' +
        'style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">' +
        '<path d="M2 2 L2 19 L7 14 L11 22 L14 21 L10 13 L17 13 Z" ' +
        'fill="#ffffff" stroke="' + cfg.color + '" stroke-width="1.6" stroke-linejoin="round"/>' +
        '</svg>';
      // Arrow tip is at the top-left of the SVG → no centering offset.
      glyph.style.left = '0px';
      glyph.style.top = '0px';
    } else {
      // Finger: translucent amber dot + ring, centered on the tip.
      var d = cfg.size;
      glyph.innerHTML =
        '<div style="position:absolute;left:' + (-d/2) + 'px;top:' + (-d/2) + 'px;' +
          'width:' + d + 'px;height:' + d + 'px;border-radius:50%;' +
          'background:' + cfg.color + ';opacity:' + cfg.dotOpacity + ';' +
          'box-shadow:0 0 0 2px rgba(251,191,36,' + cfg.ringOpacity + ');' +
          'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));"></div>';
    }

    ptr.appendChild(glyph);
    root.appendChild(ptr);
    document.documentElement.appendChild(root); // <-- on <html>, survives re-render
    return root;
  }

  var rootEl = build();
  var ptrEl = document.getElementById('__demo_cursor_ptr');

  // Current logical position of the pointer tip (viewport coords).
  var state = window.__demoCursorPos || { x: -100, y: -100 };
  window.__demoCursorPos = state;

  function applyTransform() {
    ptrEl.style.transform = 'translate(' + state.x + 'px,' + state.y + 'px)';
  }
  applyTransform();

  // --- Easing --------------------------------------------------------------
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // --- Lead-in trail (finger only, long moves) -----------------------------
  function spawnTrailDot(x, y) {
    if (!cfg.trail) return;
    var dot = document.createElement('div');
    dot.style.cssText = [
      'position:fixed',
      'left:' + (x - 5) + 'px', 'top:' + (y - 5) + 'px',
      'width:10px', 'height:10px', 'border-radius:50%',
      'background:' + cfg.color,
      'opacity:0.35',
      'pointer-events:none',
      'transition:opacity 380ms ease-out',
    ].join(';');
    rootEl.appendChild(dot);
    requestAnimationFrame(function () { dot.style.opacity = '0'; });
    setTimeout(function () { dot.remove(); }, 420);
  }

  // --- moveTo: eased tween, never teleports --------------------------------
  function moveTo(x, y, ms) {
    var duration = (ms == null ? ${MOTION.defaultMoveMs} : ms) * cfg.moveMult;
    var startX = state.x, startY = state.y;
    var dx = x - startX, dy = y - startY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    // If we were off-screen (first move), snap the START near the target so
    // the very first move doesn't fly in from the corner unnaturally — but
    // still tween the last leg so it's never an instant teleport.
    if (startX < 0 || startY < 0) {
      startX = x - dx * 0.25 || x;
      startY = y - dy * 0.25 || y;
      state.x = startX; state.y = startY; applyTransform();
      dx = x - startX; dy = y - startY;
    }
    var lastTrail = 0;
    return new Promise(function (resolve) {
      if (duration <= 0 || dist < 0.5) {
        state.x = x; state.y = y; applyTransform(); resolve(); return;
      }
      var t0 = performance.now();
      function frame(now) {
        var p = Math.min(1, (now - t0) / duration);
        var e = easeInOutCubic(p);
        state.x = startX + dx * e;
        state.y = startY + dy * e;
        applyTransform();
        // Drop trail dots on long finger moves, throttled.
        if (cfg.trail && dist > 120 && (now - lastTrail) > 55 && p < 0.92) {
          spawnTrailDot(state.x, state.y);
          lastTrail = now;
        }
        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  // --- click / tap pulse ---------------------------------------------------
  function pulse() {
    var x = state.x, y = state.y;
    var ring = document.createElement('div');
    var startR = cfg.kind === 'finger' ? cfg.ringStartR : 0;
    var maxR = cfg.ringMaxR;
    var ms = cfg.ringMs;
    ring.style.cssText = [
      'position:fixed',
      'left:' + x + 'px', 'top:' + y + 'px',
      'width:0', 'height:0', 'border-radius:50%',
      'border:2px solid ' + cfg.ring,
      'transform:translate(-50%,-50%)',
      'pointer-events:none',
      'opacity:1',
    ].join(';');
    rootEl.appendChild(ring);

    var t0 = performance.now();
    return new Promise(function (resolve) {
      function frame(now) {
        var p = Math.min(1, (now - t0) / ms);
        var r = startR + (maxR - startR) * p;
        ring.style.width = (r * 2) + 'px';
        ring.style.height = (r * 2) + 'px';
        ring.style.opacity = String(1 - p);
        // Finger glyph also gives a quick squish on tap.
        if (cfg.kind === 'finger') {
          var g = document.getElementById('__demo_cursor_glyph');
          if (g) g.style.transform = 'scale(' + (1 - 0.15 * Math.sin(p * Math.PI)) + ')';
        }
        if (p < 1) requestAnimationFrame(frame);
        else { ring.remove(); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  // --- Public API on window ------------------------------------------------
  window.__demoCursor = {
    skin: skin,
    moveTo: moveTo,
    click: pulse,
    tap: pulse,
    posOf: function () { return { x: state.x, y: state.y }; },
    // Defensive re-assert: if the root node got removed (rare hard re-render),
    // rebuild and reattach without losing logical position.
    ensure: function () {
      if (!document.getElementById(ROOT_ID)) {
        rootEl = build();
        ptrEl = document.getElementById('__demo_cursor_ptr');
        applyTransform();
      }
      return true;
    },
  };
})(${JSON.stringify('__SKIN__')});
`;

function browserScriptFor(skin) {
  return BROWSER_SCRIPT.replace(JSON.stringify('__SKIN__'), JSON.stringify(skin));
}

/**
 * injectOverlay(page, skin)
 * Registers the init script (re-runs on every navigation) AND installs it
 * into the CURRENT document immediately, so callers can inject after a goto.
 */
export async function injectOverlay(page, skin = 'arrow') {
  const script = browserScriptFor(skin);
  // Re-run on every future document (navigations, full reloads).
  await page.addInitScript(script);
  // Install into the live document right now (addInitScript only affects
  // documents created AFTER it's registered).
  try {
    await page.evaluate(script);
  } catch {
    // Page may not have a document yet (about:blank pre-goto) — the init
    // script will cover it on the next navigation. Non-fatal.
  }
}

/** Re-assert the overlay node exists; re-inject the whole script if gone. */
export async function ensureOverlay(page, skin = 'arrow') {
  const present = await page
    .evaluate(() => !!(window.__demoCursor && document.getElementById('__demo_cursor_root')))
    .catch(() => false);
  if (!present) {
    await page.evaluate(browserScriptFor(skin)).catch(() => {});
  } else {
    await page.evaluate(() => window.__demoCursor.ensure()).catch(() => {});
  }
}

/** Move the synthetic cursor to absolute viewport coords with an eased tween. */
export async function moveToXY(page, x, y, { ms = null } = {}) {
  await page.evaluate(
    ([tx, ty, tms]) => window.__demoCursor && window.__demoCursor.moveTo(tx, ty, tms),
    [x, y, ms],
  );
}

/**
 * Fire the click/tap pulse animation (the ring/ripple "bloom") on the overlay
 * (visual only). Call this ONLY when an actual click/tap is being performed —
 * never on hover, dwell, or movement. moveToSelector() already gates it behind
 * its realClick path; if you call clickAt() directly, do so only alongside a
 * real page click so the bloom never appears on a non-interactive element.
 */
export async function clickAt(page) {
  await page.evaluate(() => window.__demoCursor && window.__demoCursor.click());
}

/** Pause helper (Node-side). */
export function dwell(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * moveToSelector(page, selector, opts)
 * The high-level beat primitive. Reads the element's bounding-box center,
 * eases the synthetic cursor to it, dwells, and — ONLY when realClick is true —
 * fires the overlay pulse (ring/ripple bloom) AND the REAL Playwright click so
 * the recording matches the actual interaction. When realClick is false it
 * points + dwells + holds WITHOUT pulsing, so a hover/point never reads as a
 * click on a non-interactive element.
 *
 * opts:
 *   skin       — re-assert this skin if the overlay went missing
 *   ms         — move duration override
 *   realClick  — perform the actual page click AND fire the pulse (default
 *                true). Set false to only point at something without clicking
 *                it — no pulse is drawn in that case.
 *   dwellMs / holdMs — override the motion-contract timings.
 */
export async function moveToSelector(page, selector, opts = {}) {
  const {
    skin = 'arrow',
    ms = null,
    realClick = true,
    dwellMs = MOTION.dwellBeforeClickMs,
    holdMs = MOTION.holdAfterClickMs,
  } = opts;

  await ensureOverlay(page, skin);

  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible' });
  await el.scrollIntoViewIfNeeded().catch(() => {});

  const box = await el.boundingBox();
  if (!box) throw new Error(`moveToSelector: no bounding box for "${selector}"`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await moveToXY(page, cx, cy, { ms });
  await dwell(dwellMs); // >=250ms dwell before click (spec)

  // The click ring / tap ripple fires ONLY on a real click — never on dwell,
  // hover, or plain movement — so the cursor never looks like it's clicking a
  // non-interactive element. When realClick is false we point at the target
  // and hold, but we do NOT pulse.
  if (realClick) {
    await clickAt(page); // visual pulse — gated to the real-click path only
    // Real interaction at the same point. Use the element click so it
    // respects scroll / actionability; the overlay already sits at center.
    await el.click().catch(async () => {
      // Fallback to a positional mouse click if the element click is
      // intercepted (overlay is pointer-events:none, so this is rare).
      await page.mouse.click(cx, cy).catch(() => {});
    });
  }

  await dwell(holdMs); // ~400ms hold after (spec)
  return { x: cx, y: cy };
}

export default {
  MOTION,
  injectOverlay,
  ensureOverlay,
  moveToXY,
  clickAt,
  moveToSelector,
  dwell,
};
