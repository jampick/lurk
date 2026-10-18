'use strict';

/*
 * Comment trees from new Reddit's HTML partials.
 *
 * Since 2026-10-15 Reddit 403s every JSON comment endpoint for the anonymous
 * token (oauth `/comments/<id>`, `/api/morechildren`, www `.json`), while the
 * partial its own page loads still answers without auth (#54):
 *
 *   GET  /svc/shreddit/comments/r/<sub>/t3_<id>?render-mode=partial&sort=<sort>
 *   POST /svc/shreddit/more-comments/...   (form field `cursor`)
 *
 * This turns that markup into the `t1` / `more` Listing children the renderer
 * already reads from the API. It is scraping, so it will break when Reddit
 * changes the markup; callers should treat "no comments parsed" on a post that
 * has comments as an error, not an empty thread.
 */

const COMMENTS_PATH = /^\/(?:r|user|u)\/[^/?#]+\/comments\/([a-z0-9]+)(?:[/.?#]|$)|^\/comments\/([a-z0-9]+)(?:[/.?#]|$)/i;
const SORTS = new Set(['confidence', 'top', 'new', 'controversial', 'old', 'qa']);

/**
 * If `apiPath` asks for a thread's comments, return the post id and sort.
 *
 * `/r/pics/comments/abc/title/.json?sort=top` → { id: 'abc', sort: 'top' }
 *
 * @param {string} apiPath a path that passed isSafeApiPath
 * @returns {{ id: string, sort: string } | null}
 */
function commentThread(apiPath) {
  const m = apiPath.match(COMMENTS_PATH);
  if (!m) return null;
  const q = apiPath.indexOf('?');
  const sort = q === -1 ? null : new URLSearchParams(apiPath.slice(q + 1)).get('sort');
  return { id: (m[1] || m[2]).toLowerCase(), sort: SORTS.has(sort) ? sort : 'confidence' };
}

/** @returns {string} the partial's path for a post in subreddit `sub` */
function commentsPartialPath(sub, id, sort) {
  return `/svc/shreddit/comments/r/${encodeURIComponent(sub)}/t3_${encodeURIComponent(id)}` +
    `?render-mode=partial&sort=${encodeURIComponent(sort)}`;
}

const MORE_SRC = /^\/svc\/shreddit\/more-comments\/[A-Za-z0-9_]+\/t3_[a-z0-9]+\?[A-Za-z0-9_=&%.,:-]*$/;
const CURSOR = /^[A-Za-z0-9+/=_-]{1,4096}$/;

/** True if `src` and `cursor` look like a more-comments stub we produced. */
function isSafeMore(src, cursor) {
  return typeof src === 'string' && src.length <= 2048 && MORE_SRC.test(src) &&
    (cursor === '' || (typeof cursor === 'string' && CURSOR.test(cursor)));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeAttr(v) {
  return v.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

function parseAttrs(s) {
  const attrs = {};
  for (const m of s.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[m[1]] = decodeAttr(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

// An opening tag's attributes, allowing `>` inside quoted values.
const ATTRS = `((?:[^>"']|"[^"]*"|'[^']*')*)`;
const TOKEN = new RegExp(`<shreddit-comment\\s${ATTRS}>|</shreddit-comment>|<faceplate-partial\\s${ATTRS}>`, 'g');
const BODY_OPEN = new RegExp(`<div\\s${ATTRS}>`, 'g');
// not <shreddit-comment-badges> or -action-row, which sit before the body
const NEXT_COMMENT = /<shreddit-comment\s/g;

/*
 * The inner HTML of the first `<div slot="comment">` in html[from, to), with
 * its nested divs balanced. Deleted and removed comments have none.
 */
function commentBody(html, from, to) {
  BODY_OPEN.lastIndex = from;
  let open;
  while ((open = BODY_OPEN.exec(html)) && open.index < to) {
    if (parseAttrs(open[1]).slot !== 'comment') continue;
    const start = open.index + open[0].length;
    const tags = /<(\/?)div\b/g;
    tags.lastIndex = start;
    let depth = 1;
    let t;
    while ((t = tags.exec(html))) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) return html.slice(start, t.index).trim();
    }
    return null;
  }
  return '';
}

function moreStub(attrs, html, from) {
  const end = html.indexOf('</faceplate-partial>', from);
  const inner = html.slice(from, end === -1 ? undefined : end);
  const cursor = inner.match(/<input[^>]*\bname="cursor"[^>]*\bvalue="([^"]*)"/);
  const query = new URLSearchParams(attrs.src.split('?')[1] || '');
  const remaining = Number(query.get('comments-remaining'));
  return {
    kind: 'more',
    data: {
      count: Number.isFinite(remaining) ? remaining : 0,
      src: attrs.src,
      cursor: cursor ? decodeAttr(cursor[1]) : '',
      // the first page marks it by id, later pages only in the query
      top_level: attrs.id === 'top-level-more-comments-partial' || query.get('top-level') === '1'
    }
  };
}

function toT1(attrs, body) {
  const thing = attrs.thingId || '';
  const created = Date.parse(attrs.created);
  return {
    kind: 't1',
    data: {
      id: thing.replace(/^t1_/, ''),
      name: thing,
      author: attrs.author || '[deleted]',
      score: Number(attrs.score) || 0,
      created_utc: Number.isFinite(created) ? created / 1000 : 0,
      permalink: attrs.permalink || '',
      parent_id: attrs.parentId || attrs.postId || '',
      depth: Number(attrs.depth) || 0,
      // raw page markup, not the API's escaped and sanitized body_html: the
      // renderer runs it through a strict allowlist before showing it
      body_shreddit: body,
      replies: { kind: 'Listing', data: { children: [] } }
    }
  };
}

/**
 * Parse a comments or more-comments partial into Listing children. Nesting
 * follows the elements: Reddit renders each reply inside its parent's
 * `<shreddit-comment>`, and more-replies stubs inside the comment they extend.
 *
 * @param {string} html
 * @returns {Array<{ kind: 't1' | 'more', data: object }>}
 */
function parseComments(html) {
  const roots = [];
  const stack = [];
  const childrenOf = () => (stack.length ? stack[stack.length - 1].data.replies.data.children : roots);

  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(html))) {
    if (m[0] === '</shreddit-comment>') {
      stack.pop();
    } else if (m[1] !== undefined) {
      const after = TOKEN.lastIndex;
      NEXT_COMMENT.lastIndex = after;
      const next = NEXT_COMMENT.exec(html);
      const body = commentBody(html, after, next ? next.index : html.length);
      const node = toT1(parseAttrs(m[1]), body ?? '');
      childrenOf().push(node);
      stack.push(node);
    } else {
      const attrs = parseAttrs(m[2]);
      if (attrs.src && attrs.src.startsWith('/svc/shreddit/more-comments/')) {
        childrenOf().push(moreStub(attrs, html, TOKEN.lastIndex));
      }
    }
  }
  return roots;
}

/** Count `t1` nodes in a parsed tree. */
function countComments(children) {
  let n = 0;
  for (const c of children) {
    if (c.kind === 't1') n += 1 + countComments(c.data.replies.data.children);
  }
  return n;
}

module.exports = {
  commentThread, commentsPartialPath, isSafeMore, parseComments, countComments, decodeAttr
};
