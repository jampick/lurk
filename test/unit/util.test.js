'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fixUrl, timeAgo, compact, safeHref, imageUrlFor, bestPreview, feedPath
} = require('../../renderer/util.js');

test('fixUrl undoes Reddit double-escaped ampersands', () => {
  assert.equal(
    fixUrl('https://i.redd.it/a.jpg?w=1&amp;s=abc&amp;t=1'),
    'https://i.redd.it/a.jpg?w=1&s=abc&t=1');
  assert.equal(fixUrl(''), '');
  assert.equal(fixUrl(null), '');
  assert.equal(fixUrl(undefined), '');
});

test('timeAgo picks the largest fitting unit', () => {
  const now = 1_700_000_000_000;          // fixed clock; seconds = 1_700_000_000
  const at = (secondsAgo) => timeAgo(1_700_000_000 - secondsAgo, now);

  assert.equal(at(5), '5s');
  assert.equal(at(59), '59s');
  assert.equal(at(60), '1m');
  assert.equal(at(3599), '59m');
  assert.equal(at(3600), '1h');
  assert.equal(at(86_400), '1d');
  assert.equal(at(2_592_000), '1mo');
  assert.equal(at(31_536_000), '1y');
  assert.equal(at(63_072_000), '2y');
});

test('timeAgo never renders zero or negative ages', () => {
  const now = 1_700_000_000_000;
  // Reddit timestamps can land a hair in the future thanks to clock skew.
  assert.equal(timeAgo(1_700_000_000, now), '1s');
  assert.equal(timeAgo(1_700_000_500, now), '1s');
});

test('compact abbreviates thousands and millions', () => {
  assert.equal(compact(0), '0');
  assert.equal(compact(999), '999');
  assert.equal(compact(1000), '1k');
  assert.equal(compact(1500), '1.5k');
  assert.equal(compact(12_345), '12.3k');
  assert.equal(compact(999_999), '1000k');
  assert.equal(compact(1_000_000), '1M');
  assert.equal(compact(2_500_000), '2.5M');
});

test('compact drops a trailing .0 rather than showing 1.0k', () => {
  assert.equal(compact(1000), '1k');
  assert.equal(compact(2_000_000), '2M');
});

test('safeHref keeps http(s) and absolutises reddit-relative links', () => {
  assert.equal(safeHref('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeHref('http://example.com/x'), 'http://example.com/x');
  assert.equal(safeHref('/r/pics'), 'https://www.reddit.com/r/pics');
});

test('safeHref rejects non-http schemes', () => {
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:a@b.c',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    '',
    null,
    undefined
  ]) {
    assert.equal(safeHref(bad), null, `expected null for ${String(bad)}`);
  }
});

test('imageUrlFor matches direct image URLs over https only', () => {
  assert.equal(imageUrlFor('https://i.redd.it/a.jpg'), 'https://i.redd.it/a.jpg');
  assert.equal(imageUrlFor('https://i.redd.it/a.PNG'), 'https://i.redd.it/a.PNG');
  assert.equal(imageUrlFor('https://i.redd.it/a.jpeg'), 'https://i.redd.it/a.jpeg');
  assert.equal(imageUrlFor('https://i.redd.it/a.webp'), 'https://i.redd.it/a.webp');
  // http would be blocked by the renderer CSP, so it must not be offered
  assert.equal(imageUrlFor('http://i.redd.it/a.jpg'), null);
  assert.equal(imageUrlFor('https://example.com/page'), null);
  assert.equal(imageUrlFor('not a url'), null);
});

test('imageUrlFor rewrites giphy page links to the direct gif', () => {
  assert.equal(
    imageUrlFor('https://giphy.com/gifs/happy-dance-abc123'),
    'https://media.giphy.com/media/abc123/giphy.gif');
  assert.equal(
    imageUrlFor('https://media.giphy.com/gifs/xyz789/'),
    'https://media.giphy.com/media/xyz789/giphy.gif');
});

test('imageUrlFor does not treat a lookalike host as giphy', () => {
  // endsWith('giphy.com') alone would match evilgiphy.com
  assert.equal(imageUrlFor('https://evilgiphy.com/gifs/abc123'), null);
});

test('bestPreview prefers the first candidate at least 960px wide', () => {
  const post = {
    preview: {
      images: [{
        resolutions: [
          { url: 'https://p/320', width: 320 },
          { url: 'https://p/640', width: 640 },
          { url: 'https://p/1080', width: 1080 }
        ],
        source: { url: 'https://p/source', width: 4000 }
      }]
    }
  };
  assert.equal(bestPreview(post), 'https://p/1080');
});

test('bestPreview falls back to the largest available when all are small', () => {
  const post = {
    preview: {
      images: [{
        resolutions: [{ url: 'https://p/320', width: 320 }],
        source: { url: 'https://p/640', width: 640 }
      }]
    }
  };
  assert.equal(bestPreview(post), 'https://p/640');
});

test('bestPreview unescapes the URL it returns', () => {
  const post = {
    preview: { images: [{ resolutions: [], source: { url: 'https://p/a?x=1&amp;y=2', width: 1200 } }] }
  };
  assert.equal(bestPreview(post), 'https://p/a?x=1&y=2');
});

test('bestPreview returns null for posts with no preview', () => {
  assert.equal(bestPreview({}), null);
  assert.equal(bestPreview({ preview: { images: [] } }), null);
  assert.equal(bestPreview(null), null);
});

test('feedPath builds frontpage, subreddit and sort paths', () => {
  const base = { feed: '', sort: 'hot', topTime: 'week', after: null };
  assert.equal(feedPath(base), '/hot.json?limit=25&raw_json=1');
  assert.equal(feedPath({ ...base, feed: 'r/pics' }), '/r/pics/hot.json?limit=25&raw_json=1');
  assert.equal(feedPath({ ...base, sort: 'new' }), '/new.json?limit=25&raw_json=1');
});

test('feedPath appends the time window only for the top sort', () => {
  const base = { feed: 'r/pics', sort: 'top', topTime: 'month', after: null };
  assert.equal(feedPath(base), '/r/pics/top.json?limit=25&raw_json=1&t=month');
  assert.equal(feedPath({ ...base, sort: 'hot' }), '/r/pics/hot.json?limit=25&raw_json=1');
});

test('feedPath threads the pagination cursor', () => {
  assert.equal(
    feedPath({ feed: '', sort: 'hot', topTime: 'week', after: 't3_abc' }),
    '/hot.json?limit=25&raw_json=1&after=t3_abc');
});

test('feedPath percent-encodes search terms', () => {
  assert.equal(
    feedPath({ feed: 'search:cute cats&dogs', sort: 'hot', topTime: 'week', after: null }),
    '/search.json?q=cute%20cats%26dogs&sort=relevance&limit=25&raw_json=1');
});

test('feedPath output is always accepted by the main-process validator', () => {
  const { isSafeApiPath } = require('../../lib/reddit-path.js');
  const states = [
    { feed: '', sort: 'hot', topTime: 'week', after: null },
    { feed: 'r/pics', sort: 'top', topTime: 'all', after: 't3_abc' },
    { feed: 'search:hello world', sort: 'hot', topTime: 'week', after: null }
  ];
  for (const st of states) {
    assert.ok(isSafeApiPath(feedPath(st)), `rejected: ${feedPath(st)}`);
  }
});
