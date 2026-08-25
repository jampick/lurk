'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, compare, isNewer } = require('../../lib/semver.js');

test('parses plain and v-prefixed versions', () => {
  assert.deepEqual(parse('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parse('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parse('0.1.1'), { major: 0, minor: 1, patch: 1, prerelease: [] });
});

test('parses prerelease and build metadata', () => {
  assert.deepEqual(parse('1.2.3-beta.1'),
    { major: 1, minor: 2, patch: 3, prerelease: ['beta', '1'] });
  assert.deepEqual(parse('1.2.3+build.5'),
    { major: 1, minor: 2, patch: 3, prerelease: [] });
});

test('returns null for things that are not versions', () => {
  for (const bad of ['', 'x', '1.2', '1.2.3.4', 'latest', null, undefined, {}]) {
    assert.equal(parse(bad), null, `expected null for ${String(bad)}`);
  }
});

test('compares major, minor and patch in order', () => {
  assert.equal(compare('1.0.0', '2.0.0'), -1);
  assert.equal(compare('2.0.0', '1.0.0'), 1);
  assert.equal(compare('1.2.0', '1.10.0'), -1);   // numeric, not lexical
  assert.equal(compare('1.0.9', '1.0.10'), -1);
  assert.equal(compare('1.2.3', '1.2.3'), 0);
  assert.equal(compare('v1.2.3', '1.2.3'), 0);
});

test('a release outranks its own prerelease', () => {
  assert.equal(compare('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compare('1.0.0-rc.1', '1.0.0'), -1);
});

test('orders prerelease identifiers', () => {
  assert.equal(compare('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compare('1.0.0-rc.1', '1.0.0-rc.2'), -1);
  assert.equal(compare('1.0.0-rc.2', '1.0.0-rc.10'), -1);   // numeric identifiers
  assert.equal(compare('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compare('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
});

test('compare returns null when either side is unparseable', () => {
  assert.equal(compare('1.0.0', 'garbage'), null);
  assert.equal(compare('garbage', '1.0.0'), null);
});

test('isNewer is strict and rejects unparseable input', () => {
  assert.equal(isNewer('0.2.0', '0.1.1'), true);
  assert.equal(isNewer('v0.2.0', '0.1.1'), true);
  assert.equal(isNewer('0.1.1', '0.1.1'), false);
  assert.equal(isNewer('0.1.0', '0.1.1'), false);
  // A garbled tag must never be read as "an update is available"
  assert.equal(isNewer('', '0.1.1'), false);
  assert.equal(isNewer('nightly', '0.1.1'), false);
  assert.equal(isNewer(undefined, '0.1.1'), false);
});

test('a prerelease does not look newer than the release it precedes', () => {
  assert.equal(isNewer('0.2.0-rc.1', '0.2.0'), false);
  assert.equal(isNewer('0.2.0-rc.1', '0.1.1'), true);
});
