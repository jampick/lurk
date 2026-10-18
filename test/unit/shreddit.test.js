'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  commentThread, commentsPartialPath, isSafeMore, parseComments, countComments, decodeAttr
} = require('../../lib/shreddit.js');

// Trimmed from a real /svc/shreddit/comments partial (2026-10-18): the same
// nesting, attribute names and the badge/action-row elements that sit between
// a comment's opening tag and its body.
const comment = (id, { depth = 0, parent, author = 'alice', score = 12, body, kids = '' } = {}) => `
  <shreddit-comment created="2026-10-18T14:12:53.341000+0000" author="${author}"
    thingId="t1_${id}" depth="${depth}" ${parent ? `parentId="t1_${parent}"` : ''}
    permalink="/r/pics/comments/abc123/comment/${id}/" score="${score}" postId="t3_abc123"
    ariaLabel="Comment from ${author} > 5 hours ago" class="relative [contain:style]">
    <shreddit-comment-badges slot="commentBadges"></shreddit-comment-badges>
    <div class="min-w-0">
      ${body === undefined ? `<div class="md text-14" id="t1_${id}-comment-rtjson-content" slot="comment">
        <div id="t1_${id}-post-rtjson-content" class="py-0"><p>hello from ${id}</p><div>nested</div></div>
      </div>` : body}
    </div>
    <shreddit-comment-action-row slot="actionRow"><div>Reply</div></shreddit-comment-action-row>
    <div id="comment-children">${kids}</div>
  </shreddit-comment>`;

const moreReplies = (positions) => `
  <faceplate-partial class="more-comments-partial" loading="action"
    src="/svc/shreddit/more-comments/pics/t3_abc123?sort=TOP&amp;startingDepth=2&amp;commentParentPositions=${positions}"
    method="post" slot="children">
    <input type="hidden" name="cursor" value="Y29tbWVudHRyZWU6YQ==">
    <button type="button">more replies</button>
  </faceplate-partial>`;

const PAGE = `
  <shreddit-comment-tree>
    ${comment('aaa', { kids: comment('bbb', { depth: 1, parent: 'aaa', author: 'bob', kids: moreReplies('0,0') }) })}
    ${comment('ccc', { score: 3, body: '' })}
    <faceplate-partial class="top-level" id="top-level-more-comments-partial" loading="lazy"
      src="/svc/shreddit/more-comments/pics/t3_abc123?render-mode=partial&amp;sort=top&amp;top-level=1&amp;comments-remaining=75&amp;commentPositionOffset=2"
      method="post"><input type="hidden" name="cursor" value="Y3Vyc29yLTI="></faceplate-partial>
  </shreddit-comment-tree>`;

test('commentThread picks out thread paths and their sort', () => {
  assert.deepEqual(commentThread('/r/pics/comments/abc123/a_title/.json?raw_json=1&limit=80&sort=top'),
    { id: 'abc123', sort: 'top' });
  assert.deepEqual(commentThread('/user/spez/comments/1vgbkge/x/.json'), { id: '1vgbkge', sort: 'confidence' });
  assert.deepEqual(commentThread('/comments/abc123.json?sort=qa'), { id: 'abc123', sort: 'qa' });
  assert.equal(commentThread('/r/pics/comments/abc123/x/.json?sort=bogus').sort, 'confidence');
  for (const p of ['/r/pics/hot.json', '/r/pics/comments.json', '/user/x/comments.json?limit=5', '/search.json?q=comments']) {
    assert.equal(commentThread(p), null, p);
  }
});

test('commentsPartialPath builds the no-auth partial URL', () => {
  assert.equal(commentsPartialPath('u_spez', 'abc123', 'new'),
    '/svc/shreddit/comments/r/u_spez/t3_abc123?render-mode=partial&sort=new');
});

test('parseComments nests replies and keeps stubs where they appear', () => {
  const roots = parseComments(PAGE);
  assert.deepEqual(roots.map(c => c.kind), ['t1', 't1', 'more']);
  assert.equal(countComments(roots), 3);

  const [a, c, top] = roots;
  assert.equal(a.data.id, 'aaa');
  assert.equal(a.data.name, 't1_aaa');
  assert.equal(a.data.author, 'alice');
  assert.equal(a.data.score, 12);
  assert.equal(a.data.created_utc, Date.parse('2026-10-18T14:12:53.341Z') / 1000);
  assert.equal(a.data.parent_id, 't3_abc123');

  const [b] = a.data.replies.data.children;
  assert.equal(b.data.author, 'bob');
  assert.equal(b.data.depth, 1);
  assert.equal(b.data.parent_id, 't1_aaa');
  const [stub] = b.data.replies.data.children;
  assert.equal(stub.kind, 'more');
  assert.equal(stub.data.src,
    '/svc/shreddit/more-comments/pics/t3_abc123?sort=TOP&startingDepth=2&commentParentPositions=0,0');
  assert.equal(stub.data.cursor, 'Y29tbWVudHRyZWU6YQ==');
  assert.equal(stub.data.top_level, false);

  assert.equal(c.data.body_shreddit, '');
  assert.equal(top.data.top_level, true);
  assert.equal(top.data.count, 75);
  assert.equal(top.data.cursor, 'Y3Vyc29yLTI=');
});

test('a body is its slot="comment" div, nested divs balanced', () => {
  const [a] = parseComments(PAGE);
  assert.match(a.data.body_shreddit, /^<div id="t1_aaa-post-rtjson-content"/);
  assert.match(a.data.body_shreddit, /<p>hello from aaa<\/p><div>nested<\/div><\/div>$/);
  assert.doesNotMatch(a.data.body_shreddit, /Reply|hello from bbb/);
});

test('a more-comments response with no tree wrapper parses the same way', () => {
  const roots = parseComments(comment('ddd', { depth: 3, parent: 'zzz' }) + comment('eee', { depth: 3, parent: 'zzz' }));
  assert.deepEqual(roots.map(c => c.data.id), ['ddd', 'eee']);
  assert.equal(roots[0].data.parent_id, 't1_zzz');
});

test('a later page marks its next-page stub only in the query', () => {
  const [stub] = parseComments(`<faceplate-partial class="more-comments-partial" loading="action"
    src="/svc/shreddit/more-comments/pics/t3_abc123?sort=TOP&amp;top-level=1&amp;rootCommentOffset=9" method="post">
    <input type="hidden" name="cursor" value="Yw=="></faceplate-partial>`);
  assert.equal(stub.data.top_level, true);
  assert.equal(stub.data.count, 0);
});

test('markup with no comments parses to nothing', () => {
  assert.deepEqual(parseComments(''), []);
  assert.deepEqual(parseComments('<html><body>Welcome to Reddit</body></html>'), []);
});

test('isSafeMore accepts our stubs and nothing else', () => {
  for (const c of parseComments(PAGE).flatMap(function all(c) {
    return [c, ...(c.kind === 't1' ? c.data.replies.data.children.flatMap(all) : [])];
  }).filter(c => c.kind === 'more')) {
    assert.ok(isSafeMore(c.data.src, c.data.cursor), c.data.src);
  }
  const src = '/svc/shreddit/more-comments/pics/t3_abc123?sort=TOP';
  assert.ok(isSafeMore(src, ''));
  for (const [s, cur] of [
    ['https://evil.example/svc/shreddit/more-comments/pics/t3_a?x=1', ''],
    ['//evil.example/svc/shreddit/more-comments/pics/t3_a?x=1', ''],
    ['/svc/shreddit/comments/r/pics/t3_abc123?x=1', ''],
    ['/svc/shreddit/more-comments/../../api/t3_abc123?x=1', ''],
    [src + '#frag', ''],
    [src, 'not base64!'],
    [src, undefined],
    [42, '']
  ]) {
    assert.equal(isSafeMore(s, cur), false, `${s} / ${cur}`);
  }
});

test('decodeAttr handles named and numeric entities', () => {
  assert.equal(decodeAttr('a&amp;b &lt;i&gt; &#39;q&#x27; &quot;'), `a&b <i> 'q' "`);
  assert.equal(decodeAttr('&bogus; stays'), '&bogus; stays');
});
