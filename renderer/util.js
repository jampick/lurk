/*
 * Pure helpers shared by the renderer and the test suite.
 *
 * Loaded two ways: as a plain <script> before app.js (assigns onto window), and
 * as a CommonJS module by node:test. Everything in here must therefore stay
 * free of DOM and Electron access — anything touching `document` belongs in
 * app.js instead.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Reddit double-escapes ampersands in URL fields; they 404 until undone.
  const fixUrl = (u) => (u || '').replace(/&amp;/g, '&');

  /*
   * "3h", "2d", "5mo" — Reddit-style relative stamps.
   * `nowMs` is injectable so tests don't have to freeze the clock.
   */
  function timeAgo(utc, nowMs = Date.now()) {
    const s = Math.max(1, Math.floor(nowMs / 1000 - utc));
    const units = [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']];
    for (const [sec, label] of units) {
      if (s >= sec) return Math.floor(s / sec) + label;
    }
    return s + 's';
  }

  function compact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  /*
   * Resolve a link found in Reddit-supplied HTML to an absolute http(s) URL,
   * or null if it is anything else (javascript:, data:, mailto:, garbage).
   * Callers strip the href entirely when this returns null.
   */
  function safeHref(href) {
    // An empty href would otherwise resolve to the reddit.com homepage, turning
    // a dead anchor into a link somewhere the user never asked to go.
    if (typeof href !== 'string' || href.trim() === '') return null;
    let abs;
    try { abs = new URL(href, 'https://www.reddit.com'); } catch { return null; }
    if (abs.protocol !== 'https:' && abs.protocol !== 'http:') return null;
    return abs.href;
  }

  /*
   * Direct image URL for a link inside a comment, or null if it isn't one.
   * https only — index.html's CSP blocks http images, so an http match would
   * render as a broken icon rather than a picture.
   */
  function imageUrlFor(href) {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    if (/\.(jpe?g|png|gif|webp)$/i.test(u.pathname)) return u.href;
    if (u.hostname === 'giphy.com' || u.hostname.endsWith('.giphy.com')) {
      const m = u.pathname.match(/^\/gifs\/(?:[\w-]*-)?(\w+)\/?$/);
      if (m) return `https://media.giphy.com/media/${m[1]}/giphy.gif`;
    }
    return null;
  }

  // Largest preview at or above 960px wide, else the biggest one Reddit offers.
  function bestPreview(p) {
    const imgs = p?.preview?.images?.[0];
    if (!imgs) return null;
    const candidates = [...(imgs.resolutions || []), imgs.source].filter(Boolean);
    const pick = candidates.find(r => r.width >= 960) || candidates[candidates.length - 1];
    return pick ? fixUrl(pick.url) : null;
  }

  // Build the .json API path for the current feed/sort/pagination state.
  function feedPath(state) {
    const limit = 'limit=25&raw_json=1';
    const after = state.after ? `&after=${state.after}` : '';
    if (state.feed.startsWith('search:')) {
      const q = encodeURIComponent(state.feed.slice(7));
      return `/search.json?q=${q}&sort=relevance&${limit}${after}`;
    }
    const base = state.feed ? `/${state.feed}` : '';
    const t = state.sort === 'top' ? `&t=${state.topTime}` : '';
    return `${base}/${state.sort}.json?${limit}${t}${after}`;
  }

  return { fixUrl, timeAgo, compact, safeHref, imageUrlFor, bestPreview, feedPath };
});
