'use strict';

/*
 * Validation for the API paths the renderer hands to the main process.
 *
 * The renderer is sandboxed and context-isolated, but `reddit:fetch` is still
 * the one channel that turns renderer-controlled strings into network requests
 * carrying the user's Reddit cookies. Keep the accepted shape narrow.
 */

const MAX_LENGTH = 2048;

// A leading `//` (or `/\`) reads as a protocol-relative authority to some
// parsers, and Chromium normalises backslashes to slashes — either way, what
// we validated would not be what gets fetched.
const AUTHORITY_LIKE = /^\/[/\\]/;
const BACKSLASH = /\\/;
const CONTROL_OR_SPACE = /[\x00-\x20\x7f]/;

/**
 * True if `p` is a path we are willing to send to Reddit's API host.
 *
 * @param {unknown} p
 * @returns {boolean}
 */
function isSafeApiPath(p) {
  if (typeof p !== 'string') return false;
  if (p.length === 0 || p.length > MAX_LENGTH) return false;
  if (!p.startsWith('/')) return false;
  if (AUTHORITY_LIKE.test(p)) return false;
  if (BACKSLASH.test(p)) return false;
  if (CONTROL_OR_SPACE.test(p)) return false;
  return true;
}

/**
 * Rewrite a www.reddit.com `.json` path for oauth.reddit.com, which serves the
 * same JSON without the suffix. Since 2026-10 www.reddit.com 403s anonymous
 * `.json` requests outright, cookies or not (#52).
 *
 * `/r/pics/hot.json?limit=25` becomes `/r/pics/hot?limit=25`, and a permalink
 * like `/r/x/comments/abc/title/.json?…` becomes `/r/x/comments/abc/title/?…`.
 *
 * @param {string} p a path that passed isSafeApiPath
 * @returns {string}
 */
function toOauthPath(p) {
  const q = p.indexOf('?');
  const pathname = q === -1 ? p : p.slice(0, q);
  const query = q === -1 ? '' : p.slice(q);
  return pathname.replace(/\.json$/, '') + query;
}

module.exports = { isSafeApiPath, toOauthPath, MAX_LENGTH };
