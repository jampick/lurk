'use strict';

/*
 * og:image extraction for link posts Reddit gives no preview for.
 *
 * Deliberately regex-based rather than a parser: we only ever see the first
 * ~200 KB of <head>, which is frequently unbalanced, and pulling in a real
 * HTML parser to read one meta tag is not a trade worth making.
 */

// Matches <meta property="og:image" ... content="..."> in either attribute order.
const META_PROP_FIRST =
  /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/i;
const META_CONTENT_FIRST =
  /<meta[^>]+content=["'][^"']+["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)/i;

/**
 * @param {string} html    Partial HTML (head is enough).
 * @param {string} baseUrl Absolute URL the HTML was fetched from, for resolving
 *                         relative and protocol-relative content values.
 * @returns {string|null}  Absolute https URL, or null. http is rejected because
 *                         index.html's CSP only permits https images.
 */
function extractOgImage(html, baseUrl) {
  if (typeof html !== 'string' || !html) return null;

  const tag = html.match(META_PROP_FIRST)?.[0] || html.match(META_CONTENT_FIRST)?.[0];
  const content = tag?.match(/content=["']([^"']+)["']/i)?.[1];
  if (!content) return null;

  try {
    const abs = new URL(content.replace(/&amp;/g, '&'), baseUrl).href;
    return abs.startsWith('https://') ? abs : null;
  } catch {
    return null;
  }
}

module.exports = { extractOgImage };
