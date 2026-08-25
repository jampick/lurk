'use strict';

/*
 * Just enough SemVer to answer "is the release on GitHub newer than us?".
 *
 * We deliberately don't depend on the `semver` package: this runs in the main
 * process of a shipping app, the input is our own tag names, and the full
 * range/satisfies machinery is not needed.
 */

const RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parse "v1.2.3-beta.1" into parts, or null if it isn't SemVer. */
function parse(version) {
  const m = RE.exec(String(version || '').trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : []
  };
}

function comparePrerelease(a, b) {
  // A version without a prerelease outranks one with it (1.0.0 > 1.0.0-rc.1).
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1;              // numeric identifiers sort below alphanumeric
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** -1 / 0 / 1, or null if either side is unparseable. */
function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key]) return pa[key] < pb[key] ? -1 : 1;
  }
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** True only when `candidate` is a well-formed version strictly above `current`. */
function isNewer(candidate, current) {
  return compare(candidate, current) === 1;
}

module.exports = { parse, compare, isNewer };
