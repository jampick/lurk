'use strict';

/*
 * Validates the electron-builder config against electron-builder's own JSON
 * schema, in-process.
 *
 * Without this, a typo in a `build` key is only caught by actually running
 * electron-builder — which in CI means waiting for a Linux runner to install
 * dependencies first. The schema ships inside app-builder-lib, so this checks
 * against exactly the version we build with.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const Ajv = require('ajv');
const schema = require('app-builder-lib/scheme.json');

function validator() {
  // strict:false — electron-builder's schema uses keywords Ajv's strict mode
  // rejects, and it is not ours to fix.
  const ajv = new Ajv({ strict: false, allErrors: true, allowUnionTypes: true });
  return ajv.compile(schema);
}

test('the electron-builder config matches the schema it will be built with', () => {
  const validate = validator();
  const ok = validate(pkg.build);

  if (!ok) {
    const detail = validate.errors
      .map(e => `  ${e.instancePath || '(root)'}: ${e.message}`)
      .join('\n');
    assert.fail(`build config is invalid:\n${detail}`);
  }
  assert.ok(ok);
});

test('an unknown key under build.linux is rejected', () => {
  // Guards the guard: proves the schema is actually being enforced rather than
  // silently passing everything.
  const validate = validator();
  const broken = JSON.parse(JSON.stringify(pkg.build));
  broken.linux.thisKeyDoesNotExist = true;
  assert.equal(validate(broken), false,
    'schema validation is not catching unknown keys — this test is not protecting anything');
});
