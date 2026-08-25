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
 * True if `p` is a path we are willing to append to https://www.reddit.com.
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

module.exports = { isSafeApiPath, MAX_LENGTH };
