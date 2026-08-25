'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractOgImage } = require('../../lib/og.js');

const BASE = 'https://news.example.com/article/1';

test('extracts og:image with property before content', () => {
  const html = '<head><meta property="og:image" content="https://cdn.example.com/a.jpg"></head>';
  assert.equal(extractOgImage(html, BASE), 'https://cdn.example.com/a.jpg');
});

test('extracts og:image with content before property', () => {
  const html = '<head><meta content="https://cdn.example.com/b.jpg" property="og:image"></head>';
  assert.equal(extractOgImage(html, BASE), 'https://cdn.example.com/b.jpg');
});

test('accepts name= as well as property=, and twitter:image', () => {
  assert.equal(
    extractOgImage('<meta name="og:image" content="https://cdn.example.com/c.jpg">', BASE),
    'https://cdn.example.com/c.jpg');
  assert.equal(
    extractOgImage('<meta name="twitter:image" content="https://cdn.example.com/d.jpg">', BASE),
    'https://cdn.example.com/d.jpg');
  assert.equal(
    extractOgImage('<meta name="twitter:image:src" content="https://cdn.example.com/e.jpg">', BASE),
    'https://cdn.example.com/e.jpg');
});

test('handles single-quoted attributes', () => {
  assert.equal(
    extractOgImage("<meta property='og:image' content='https://cdn.example.com/f.jpg'>", BASE),
    'https://cdn.example.com/f.jpg');
});

test('resolves relative and protocol-relative URLs against the page', () => {
  assert.equal(
    extractOgImage('<meta property="og:image" content="/img/hero.jpg">', BASE),
    'https://news.example.com/img/hero.jpg');
  assert.equal(
    extractOgImage('<meta property="og:image" content="//cdn.example.com/hero.jpg">', BASE),
    'https://cdn.example.com/hero.jpg');
});

test('unescapes &amp; in the URL', () => {
  assert.equal(
    extractOgImage('<meta property="og:image" content="https://cdn.example.com/i?a=1&amp;b=2">', BASE),
    'https://cdn.example.com/i?a=1&b=2');
});

test('rejects http images because the renderer CSP blocks them', () => {
  assert.equal(
    extractOgImage('<meta property="og:image" content="http://cdn.example.com/a.jpg">', BASE),
    null);
  // A relative URL on an http page resolves to http, and must be rejected too.
  assert.equal(
    extractOgImage('<meta property="og:image" content="/a.jpg">', 'http://news.example.com/x'),
    null);
});

test('returns null when there is no og:image', () => {
  assert.equal(extractOgImage('<head><title>No image here</title></head>', BASE), null);
  assert.equal(extractOgImage('<meta property="og:title" content="Just a title">', BASE), null);
  assert.equal(extractOgImage('', BASE), null);
  assert.equal(extractOgImage(null, BASE), null);
  assert.equal(extractOgImage(undefined, BASE), null);
});

test('returns null rather than throwing when the base URL is unusable', () => {
  const html = '<meta property="og:image" content="/hero.jpg">';
  assert.equal(extractOgImage(html, 'not-a-url'), null);
  assert.equal(extractOgImage(html, ''), null);
});

test('a content value that is merely odd still resolves, and is left to 404', () => {
  // Not our job to validate that the image exists — the <img> onerror in the
  // renderer removes it. We only guarantee scheme safety.
  assert.equal(
    extractOgImage('<meta property="og:image" content="::::">', BASE),
    'https://news.example.com/article/::::');
});

test('survives the truncated head we actually fetch', () => {
  // main.js stops reading at 200 KB or </head>, so the tag is often the last
  // complete thing in the buffer and the document is left unbalanced.
  const html = '<html><head><meta charset="utf-8">'
    + '<meta property="og:image" content="https://cdn.example.com/trunc.jpg">'
    + '<meta property="og:desc" content="cut off here';
  assert.equal(extractOgImage(html, BASE), 'https://cdn.example.com/trunc.jpg');
});

test('picks the first og:image when a page declares several', () => {
  const html = '<meta property="og:image" content="https://cdn.example.com/first.jpg">'
    + '<meta property="og:image" content="https://cdn.example.com/second.jpg">';
  assert.equal(extractOgImage(html, BASE), 'https://cdn.example.com/first.jpg');
});
