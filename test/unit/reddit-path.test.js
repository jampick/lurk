'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isSafeApiPath, MAX_LENGTH } = require('../../lib/reddit-path.js');

const BACKSLASH = String.fromCharCode(92);

test('accepts the paths the renderer actually asks for', () => {
  const good = [
    '/hot.json?limit=25&raw_json=1',
    '/r/pics/top.json?limit=25&raw_json=1&t=week',
    '/search.json?q=cats&sort=relevance&limit=25&raw_json=1',
    '/comments/abc123.json?sort=confidence&raw_json=1',
    '/subreddits/search.json?q=pi&limit=8&raw_json=1',
    '/'
  ];
  for (const p of good) assert.ok(isSafeApiPath(p), `should accept: ${p}`);
});

test('rejects anything that is not a non-empty string', () => {
  for (const bad of ['', null, undefined, 42, {}, [], true]) {
    assert.equal(isSafeApiPath(bad), false, `should reject: ${String(bad)}`);
  }
});

test('rejects paths that do not start with a slash', () => {
  assert.equal(isSafeApiPath('hot.json'), false);
  assert.equal(isSafeApiPath('https://evil.example.com/x'), false);
  assert.equal(isSafeApiPath('../../etc/passwd'), false);
});

test('rejects authority-like prefixes that could retarget the host', () => {
  // 'https://www.reddit.com' + '//evil.example.com/x' is parsed as a path by
  // Chromium, but not by every consumer of the string — do not rely on it.
  assert.equal(isSafeApiPath('//evil.example.com/x'), false);
  assert.equal(isSafeApiPath('/' + BACKSLASH + 'evil.example.com/x'), false);
});

test('rejects backslashes anywhere, since URL parsers rewrite them to slashes', () => {
  assert.equal(isSafeApiPath('/r/pics' + BACKSLASH + '..' + BACKSLASH + 'admin'), false);
  assert.equal(isSafeApiPath('/a' + BACKSLASH + 'b'), false);
});

test('rejects control characters and raw whitespace', () => {
  assert.equal(isSafeApiPath('/hot.json?q=a b'), false);          // space
  assert.equal(isSafeApiPath('/hot.json' + String.fromCharCode(10)), false);  // newline
  assert.equal(isSafeApiPath('/hot.json' + String.fromCharCode(13)), false);  // CR
  assert.equal(isSafeApiPath('/hot.json' + String.fromCharCode(9)), false);   // tab
  assert.equal(isSafeApiPath('/hot.json' + String.fromCharCode(0)), false);   // NUL
  assert.equal(isSafeApiPath('/hot.json' + String.fromCharCode(127)), false); // DEL
});

test('a CRLF payload cannot be smuggled through the path', () => {
  const crlf = String.fromCharCode(13) + String.fromCharCode(10);
  assert.equal(isSafeApiPath('/hot.json' + crlf + 'X-Injected: 1'), false);
});

test('enforces a length ceiling', () => {
  assert.ok(isSafeApiPath('/' + 'a'.repeat(MAX_LENGTH - 1)));
  assert.equal(isSafeApiPath('/' + 'a'.repeat(MAX_LENGTH)), false);
});

test('percent-encoded input is accepted, since that is what encodeURIComponent emits', () => {
  assert.ok(isSafeApiPath('/search.json?q=cute%20cats%26dogs'));
});
