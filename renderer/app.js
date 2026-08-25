'use strict';

/* ---------------- State ---------------- */
const state = {
  feed: '',            // '' = frontpage, 'r/pics', 'search:cats'
  sort: 'hot',
  topTime: 'week',
  after: null,
  loading: false,
  exhausted: false,
  seen: new Set()
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const feedEl = $('#feed');
const statusEl = $('#feed-status');
const scrollEl = $('#feed-scroll');
const titleEl = $('#feed-title');

/* ---------------- Helpers ---------------- */
const decodeEntities = (() => {
  const ta = document.createElement('textarea');
  return (s) => { ta.innerHTML = s || ''; return ta.value; };
})();

/*
 * fixUrl, timeAgo, compact, safeHref, imageUrlFor, bestPreview and feedPath all
 * live in util.js — pure enough to unit test, so they are loaded from there
 * (as globals) by both index.html and the test suite.
 */

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

// Reddit's *_html fields are entity-escaped, pre-sanitized HTML fragments.
// Belt-and-suspenders on top of Reddit's sanitization + our CSP: allow only
// http(s) links, absolutize relative reddit paths, strip anything else.
function redditHtml(escapedHtml) {
  const div = el('div');
  div.innerHTML = decodeEntities(escapedHtml);
  $$('a', div).forEach(a => {
    const href = safeHref(a.getAttribute('href'));
    if (!href) {
      a.removeAttribute('href');
      return;
    }
    a.href = href;
    a.target = '_blank';           // window-open handler routes to system browser
    a.rel = 'noreferrer noopener';
  });
  return div;
}

/* ---- inline images for links inside comments ---- */
function inlineCommentImages(body) {
  let count = 0;
  for (const a of $$('a[href]', body)) {
    if (count >= 6) break;                 // don't let one comment load dozens
    const src = imageUrlFor(a.href);
    if (!src) continue;
    count++;
    const img = el('img', 'comment-inline-img');
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    img.onclick = () => openLightbox(src);
    img.onerror = () => img.remove();
    // raw pasted URLs read terribly — shorten them to the host
    if (a.textContent.trim().startsWith('http')) {
      a.textContent = `🖼 ${new URL(src).hostname}`;
    }
    a.insertAdjacentElement('afterend', img);
  }
}

async function api(path) {
  const res = await window.lurk.fetchReddit(path);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

/* ---------------- Feed loading ---------------- */
async function loadMore() {
  if (state.loading || state.exhausted) return;
  state.loading = true;
  statusEl.innerHTML = '';
  statusEl.appendChild(el('div', 'spinner'));
  try {
    const data = await api(feedPath(state));
    const children = data?.data?.children || [];
    state.after = data?.data?.after || null;
    if (!state.after) state.exhausted = true;
    const posts = children.filter(c => c.kind === 't3' && !state.seen.has(c.data.id));
    posts.forEach(c => state.seen.add(c.data.id));
    posts.forEach(c => feedEl.appendChild(renderPost(c.data)));
    statusEl.textContent = feedEl.children.length === 0
      ? 'Nothing here. Try another subreddit.'
      : (state.exhausted ? "That's everything." : '');
  } catch (err) {
    statusEl.textContent = `Couldn't load: ${err.message} — scroll to retry`;
  } finally {
    state.loading = false;
  }
}

function resetFeed() {
  closeDetail();
  state.after = null;
  state.exhausted = false;
  state.seen.clear();
  teardownMedia(feedEl);
  feedEl.innerHTML = '';
  scrollEl.scrollTop = 0;
  loadMore();
}

function setFeed(feed, displayName) {
  state.feed = feed;
  titleEl.textContent = displayName;
  $$('.side-item').forEach(item =>
    item.classList.toggle('active', item.dataset.feed === feed));
  resetFeed();
}

/* infinite scroll */
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) loadMore();
}, { root: scrollEl, rootMargin: '900px' }).observe($('#sentinel'));

/* ---------------- Post rendering ---------------- */
function renderPost(p) {
  const card = el('article', 'post-card');
  if (readPosts.has(p.id)) card.classList.add('read');

  const head = el('div', 'post-head');
  const sub = el('span', 'post-sub', p.subreddit_name_prefixed);
  sub.onclick = () => setFeed(`r/${p.subreddit}`, p.subreddit_name_prefixed);
  head.appendChild(sub);
  head.appendChild(el('span', null, `u/${p.author} · ${timeAgo(p.created_utc)}`));
  if (p.link_flair_text) head.appendChild(el('span', 'post-flair', p.link_flair_text));
  if (p.over_18) head.appendChild(el('span', 'post-nsfw', 'NSFW'));
  card.appendChild(head);

  const title = el('a', 'post-title', decodeEntities(p.title));
  title.onclick = () => openPost(p, card);
  card.appendChild(title);

  const media = renderMedia(p);
  if (media) card.appendChild(media);

  if (p.selftext && !media) {
    card.appendChild(renderCardSelftext(p));
  }

  const foot = el('div', 'post-foot');
  const score = el('span', 'foot-btn foot-score', `▲ ${compact(p.score)}`);
  const comments = el('button', 'foot-btn', `💬 ${compact(p.num_comments)}`);
  comments.onclick = () => openPost(p, card);
  const open = el('button', 'foot-btn', '↗ Reddit');
  open.onclick = () => window.lurk.openExternal('https://www.reddit.com' + p.permalink);
  foot.append(score, comments, open);
  card.appendChild(foot);

  return card;
}

/* Clamped selftext preview that expands in place to the full post body. */
function renderCardSelftext(p) {
  const wrap = el('div', 'post-selftext-wrap');
  const st = el('div', 'post-selftext', decodeEntities(p.selftext).slice(0, 600));
  const toggle = el('button', 'selftext-toggle', 'Read more');
  toggle.hidden = true;
  let expanded = false;

  const setExpanded = (on) => {
    expanded = on;
    st.classList.toggle('expanded', on);
    if (on) {
      if (p.selftext_html) {
        const body = redditHtml(p.selftext_html);
        body.className = 'detail-selftext';
        st.replaceChildren(body);
      } else {
        st.textContent = decodeEntities(p.selftext);
      }
      toggle.textContent = 'Show less';
    } else {
      st.textContent = decodeEntities(p.selftext).slice(0, 600);
      toggle.textContent = 'Read more';
    }
    toggle.hidden = false;
  };

  // show the toggle only once the preview actually overflows its clamp
  new ResizeObserver(() => {
    if (!expanded) toggle.hidden = st.scrollHeight <= st.clientHeight + 2;
  }).observe(st);

  st.onclick = (e) => {
    if (e.target.closest('a')) return;
    if (!expanded && !toggle.hidden) setExpanded(true);
  };
  toggle.onclick = () => setExpanded(!expanded);

  wrap.append(st, toggle);
  return wrap;
}

/* ---------------- Media rendering ---------------- */
function nsfwWrap(p, mediaEl) {
  if (!p.over_18) return mediaEl;
  const wrap = el('div', 'media-blur');
  wrap.appendChild(mediaEl);
  wrap.onclick = (e) => {
    e.stopPropagation();
    wrap.classList.remove('media-blur');
    wrap.onclick = null;
  };
  return wrap;
}

function renderMedia(p) {
  const wrap = el('div', 'post-media');

  // Reddit-hosted video
  const rv = p.media?.reddit_video || p.preview?.reddit_video_preview;
  if (rv) {
    wrap.appendChild(makeVideo(rv, p));
    return nsfwWrap(p, wrap);
  }

  // Gallery
  if (p.is_gallery && p.gallery_data && p.media_metadata) {
    const urls = p.gallery_data.items
      .map(item => {
        const meta = p.media_metadata[item.media_id];
        if (!meta || meta.status !== 'valid') return null;
        const src = meta.s?.u || meta.s?.gif || meta.p?.[meta.p.length - 1]?.u;
        return src ? fixUrl(src) : null;
      })
      .filter(Boolean);
    if (urls.length) {
      wrap.appendChild(makeGallery(urls));
      return nsfwWrap(p, wrap);
    }
  }

  // YouTube — autoplay handled by the visibility observer via the widget API
  const yt = (p.url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  if (yt) {
    const iframe = el('iframe');
    iframe._ytid = yt[1];
    iframe.src = `https://www.youtube-nocookie.com/embed/${yt[1]}`
      + `?enablejsapi=1&playsinline=1&mute=${soundOn() ? 0 : 1}`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.addEventListener('load', () => {
      try {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch { }
    });
    autoplayObs.observe(iframe);
    wrap.appendChild(iframe);
    return wrap;
  }

  // Direct images / gifs (imgur .gifv → .mp4)
  const url = fixUrl(p.url || '');
  if (/\.gifv$/i.test(url)) {
    const v = el('video');
    v.src = url.replace(/\.gifv$/i, '.mp4');
    v.loop = v.muted = v.autoplay = v.playsInline = true;
    v._silent = true;
    autoplayObs.observe(v);
    wrap.appendChild(v);
    return nsfwWrap(p, wrap);
  }
  if (/\.gif(\?|$)/i.test(url)) {
    // animated gif: prefer reddit's looping mp4 variant (far lighter), else the real gif
    const mp4 = p.preview?.images?.[0]?.variants?.mp4?.source?.url;
    if (mp4) {
      const v = el('video');
      v.src = fixUrl(mp4);
      v.loop = v.muted = v.autoplay = v.playsInline = true;
      v._silent = true;
      autoplayObs.observe(v);
      wrap.appendChild(v);
    } else {
      const img = el('img');
      img.loading = 'lazy';
      img.src = url;                    // the gif itself, not the static preview
      img.onclick = () => openLightbox(url);
      wrap.appendChild(img);
    }
    return nsfwWrap(p, wrap);
  }
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(url) || p.post_hint === 'image') {
    const img = el('img');
    img.loading = 'lazy';
    const preview = bestPreview(p);
    img.src = preview || url;
    let triedRaw = !preview || preview === url;
    img.onerror = () => {           // dead preview URL → retry original, then give up
      if (!triedRaw) { triedRaw = true; img.src = url; }
      else wrap.remove();
    };
    img.onclick = () => openLightbox(fixUrl(p.url) || img.src);
    wrap.appendChild(img);
    return nsfwWrap(p, wrap);
  }

  // External link: big article image inline when reddit has one, link bar below
  if (!p.is_self && p.url && !p.url.includes(p.permalink)) {
    const outer = el('div');
    const openArticle = () => window.lurk.openExternal(p.url);

    const big = bestPreview(p);
    const thumb = /^https?:/.test(p.thumbnail || '') ? fixUrl(p.thumbnail) : null;
    if (big) {
      const img = el('img');
      img.loading = 'lazy';
      img.src = big;
      img.style.cursor = 'pointer';
      img.onclick = openArticle;
      wrap.appendChild(img);
      const mediaNode = nsfwWrap(p, wrap);
      img.onerror = () => mediaNode.remove();   // dead preview → just the link card
      outer.appendChild(mediaNode);
    }

    const link = el('div', 'link-card');
    if (!big && thumb) {
      const img = el('img');
      img.src = thumb;
      img.loading = 'lazy';
      link.appendChild(img);
    }
    let host = '';
    try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch { host = p.url; }
    link.appendChild(el('div', 'link-url', `${host} ↗`));
    link.onclick = openArticle;
    outer.appendChild(link);

    // no reddit preview at all — ask the article itself for its og:image
    if (!big) {
      window.lurk.articlePreviewImage(p.url).then(src => {
        if (!src || !outer.isConnected) return;
        const mediaWrap = el('div', 'post-media');
        const img = el('img');
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.src = src;
        img.style.cursor = 'pointer';
        img.onclick = openArticle;
        mediaWrap.appendChild(img);
        const mediaNode = nsfwWrap(p, mediaWrap);
        img.onerror = () => mediaNode.remove();
        outer.insertBefore(mediaNode, link);
      });
    }
    return outer;
  }

  return null;
}

function makeVideo(rv, p) {
  const video = el('video');
  video.playsInline = true;
  if (rv.is_gif) {
    // reddit-hosted "gif" (soundless clip): behave like a gif — autoplay + loop
    video.loop = video.muted = video.autoplay = true;
    video._silent = true;
    video.src = fixUrl(rv.fallback_url);
    autoplayObs.observe(video);
    return video;
  }
  video.controls = true;
  video.preload = 'metadata';
  bindStickyMute(video);
  autoplayObs.observe(video);
  const poster = bestPreview(p);
  if (poster) video.poster = poster;

  const hlsUrl = fixUrl(rv.hls_url);
  if (hlsUrl && window.Hls && Hls.isSupported()) {
    // attach immediately (manifest only) so the element is playable;
    // segments start downloading on first play
    const hls = new Hls({ maxBufferLength: 20, autoStartLoad: false });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    video._hls = hls;
    // Pin the top variant: reddit's CMAF masters wire different video levels to
    // DIFFERENT audio groups (128k vs 64k), and ABR switching between them
    // garbles audio. One fixed level = one audio group = clean sound.
    hls.on(Hls.Events.MANIFEST_PARSED, (_e, d) => {
      let best = 0;
      d.levels.forEach((l, i) => { if (l.bitrate > d.levels[best].bitrate) best = i; });
      hls.currentLevel = best;
    });
    video.addEventListener('play', () => hls.startLoad(), { once: true });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {             // HLS died — fall back to soundless mp4
        hls.destroy();
        video._hls = null;
        video.src = fixUrl(rv.fallback_url);
        video.play().catch(() => {});
      }
    });
  } else {
    video.src = fixUrl(rv.fallback_url);
  }
  return video;
}

function makeGallery(urls) {
  const g = el('div', 'gallery');
  let idx = 0;
  const img = el('img');
  img.loading = 'lazy';
  img.onerror = () => g.parentElement?.remove();
  img.src = urls[0];
  img.onclick = () => openLightbox(urls[idx]);
  const count = el('span', 'gallery-count', `1 / ${urls.length}`);
  const show = (i) => {
    idx = (i + urls.length) % urls.length;
    img.src = urls[idx];
    count.textContent = `${idx + 1} / ${urls.length}`;
  };
  const prev = el('button', 'gallery-nav gallery-prev', '‹');
  const next = el('button', 'gallery-nav gallery-next', '›');
  prev.onclick = (e) => { e.stopPropagation(); show(idx - 1); };
  next.onclick = (e) => { e.stopPropagation(); show(idx + 1); };
  g.append(img, count);
  if (urls.length > 1) g.append(prev, next);
  return g;
}

/* ---------------- Autoplay + sticky sound ---------------- */
// Videos autoplay when mostly visible, pause when scrolled away.
// Sound is one global preference: muted by default; unmuting any video
// unmutes the ones that follow, muting one mutes the ones that follow.
function soundOn() { return localStorage.getItem('soundOn') === '1'; }
function setSoundOn(on) { localStorage.setItem('soundOn', on ? '1' : '0'); }

function bindStickyMute(video) {
  video.muted = !soundOn();
  video.addEventListener('volumechange', () => {
    setSoundOn(!video.muted);
    if (!video.muted) reconcileAutoplay(video);   // unmuting claims the one audio slot
  });
  video.addEventListener('play', () => reconcileAutoplay(video));
}

function ytCommand(iframe, func) {
  try {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }), '*');
  } catch { }
}

// Only ONE audible video plays at a time — the eligible one nearest the
// viewport center — so overlapping soundtracks can't garble each other.
// Silent gif-loop clips (v._silent) are exempt and autoplay freely.
const audibleInView = new Set();

function mediaPlay(m) {
  if (m.tagName === 'VIDEO') m.play().catch(() => {});
  else ytCommand(m, 'playVideo');
}
function mediaPause(m) {
  if (m.tagName === 'VIDEO') { if (!m.paused) m.pause(); }
  else ytCommand(m, 'pauseVideo');
}

function reconcileAutoplay(preferred) {
  if (preferred && !audibleInView.has(preferred)) {
    // user manually started something off-screen — silence the rest, let it play
    for (const m of audibleInView) mediaPause(m);
    return;
  }
  let winner = preferred || null;
  if (!winner) {
    let best = Infinity;
    const mid = window.innerHeight / 2;
    for (const m of audibleInView) {
      const r = m.getBoundingClientRect();
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < best) { best = d; winner = m; }
    }
  }
  for (const m of audibleInView) {
    if (m === winner) mediaPlay(m);
    else mediaPause(m);
  }
}

const autoplayObs = new IntersectionObserver((entries) => {
  for (const en of entries) {
    const m = en.target;
    if (m._silent) {                       // soundless clip: simple visibility rule
      if (en.intersectionRatio >= 0.6) mediaPlay(m);
      else mediaPause(m);
      continue;
    }
    if (en.intersectionRatio >= 0.6) {
      audibleInView.add(m);
    } else {
      audibleInView.delete(m);
      mediaPause(m);
    }
  }
  reconcileAutoplay();
}, { threshold: [0, 0.6] });   // viewport root: works in feed, side panel, and popup

function teardownMedia(container) {
  $$('video', container).forEach(v => {
    v.pause();
    v._hls?.destroy();
    autoplayObs.unobserve(v);
    audibleInView.delete(v);
  });
  $$('iframe', container).forEach(f => {
    autoplayObs.unobserve(f);
    audibleInView.delete(f);
  });
}

// Embedding disabled by the uploader (101/150/152/153) — swap the dead
// iframe for a thumbnail card that opens the video on YouTube.
function ytEmbedFallback(iframe) {
  const id = iframe._ytid;
  const wrap = iframe.parentElement;
  if (iframe._embedBlocked || !id || !wrap) return;
  iframe._embedBlocked = true;
  autoplayObs.unobserve(iframe);
  const card = el('div', 'yt-fallback');
  const img = el('img');
  img.loading = 'lazy';
  img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  card.appendChild(img);
  card.appendChild(el('div', 'yt-fallback-label', '▶ Watch on YouTube'));
  card.onclick = () => window.lurk.openExternal('https://www.youtube.com/watch?v=' + id);
  wrap.innerHTML = '';
  wrap.appendChild(card);
}

// YouTube's player reports mute changes via the widget message channel —
// mirror user (un)mutes inside the iframe into the global preference.
window.addEventListener('message', (e) => {
  if (typeof e.data !== 'string' || !/youtube/.test(e.origin || '')) return;
  let d;
  try { d = JSON.parse(e.data); } catch { return; }
  if (d?.event === 'onError') {
    if ([101, 150, 152, 153].includes(Number(d.info))) {
      const frame = $$('iframe').find(f => f.contentWindow === e.source);
      if (frame) ytEmbedFallback(frame);
    }
    return;
  }
  const muted = d?.info?.muted;
  if (typeof muted !== 'boolean') return;
  const frame = $$('iframe').find(f => f.contentWindow === e.source);
  if (!frame) return;
  if (frame._lastMuted !== undefined && frame._lastMuted !== muted) {
    setSoundOn(!muted);
    if (!muted) reconcileAutoplay(frame);   // unmuting claims the one audio slot
  }
  frame._lastMuted = muted;
});

/* ---------------- Lightbox ---------------- */
function openLightbox(src) {
  const box = el('div');
  box.id = 'lightbox';
  const img = el('img');
  img.src = src;
  box.appendChild(img);
  box.onclick = () => box.remove();
  document.body.appendChild(box);
}

/* ---------------- Post detail + comments ---------------- */
const overlay = $('#overlay');
const overlayContent = $('#overlay-content');
const paneEl = $('#detail-pane');
const paneContent = $('#pane-content');
let selectedCard = null;

// where comments open: 'side' (panel next to feed) or 'overlay' (popup)
function commentsMode() { return localStorage.getItem('commentsMode') || 'side'; }

function openPost(p, card) {
  closeDetail();
  markRead(p, card);
  if (card) {
    card.classList.add('selected');
    selectedCard = card;
  }
  const useSide = commentsMode() === 'side' && window.innerWidth >= 950;
  if (useSide) {
    paneEl.classList.remove('hidden');
    // the post itself stays in the feed — the panel is comments only
    renderDetail(paneContent, p, { commentsOnly: true });
    lastOpenPost = p;
    startLive(p);
  } else {
    overlay.classList.remove('hidden');
    renderDetail(overlayContent, p);
  }
}

async function renderDetail(container, p, { commentsOnly = false } = {}) {
  container.innerHTML = '';
  container.scrollTop = 0;

  if (!commentsOnly) {
    const head = el('div', 'post-head');
    const sub = el('span', 'post-sub', p.subreddit_name_prefixed);
    sub.onclick = () => { closeDetail(); setFeed(`r/${p.subreddit}`, p.subreddit_name_prefixed); };
    head.appendChild(sub);
    head.appendChild(el('span', null,
      `u/${p.author} · ${timeAgo(p.created_utc)} · ▲ ${compact(p.score)}`));
    container.appendChild(head);
    container.appendChild(el('h1', 'detail-title', decodeEntities(p.title)));

    const media = renderMedia(p);
    if (media) container.appendChild(media);

    if (p.selftext_html) {
      const body = redditHtml(p.selftext_html);
      body.className = 'detail-selftext';
      container.appendChild(body);
    }
  }

  loadComments(container, p);
}

const COMMENT_SORTS = [
  ['confidence', 'Best'], ['top', 'Top'], ['new', 'New'],
  ['controversial', 'Controversial'], ['old', 'Old'], ['qa', 'Q&A']
];
function commentSort() { return localStorage.getItem('commentSort') || 'confidence'; }

async function loadComments(container, p) {
  // a sort change re-runs this: clear the previous comments render only
  const old = container.querySelector('.comments-header');
  if (old) {
    while (old.nextSibling) old.nextSibling.remove();
    old.remove();
  }

  const header = el('div', 'comments-header');
  header.appendChild(el('span', 'comments-count', `${compact(p.num_comments)} comments`));
  const sortSel = el('select', 'comment-sort');
  for (const [value, label] of COMMENT_SORTS) {
    const opt = el('option', null, label);
    opt.value = value;
    if (value === commentSort()) opt.selected = true;
    sortSel.appendChild(opt);
  }
  sortSel.onchange = () => {
    localStorage.setItem('commentSort', sortSel.value);
    loadComments(container, p);
  };
  header.appendChild(sortSel);
  container.appendChild(header);

  const spinner = el('div', 'spinner');
  container.appendChild(spinner);

  try {
    const data = await api(`${p.permalink}.json?raw_json=1&limit=80&depth=6&sort=${commentSort()}`);
    spinner.remove();
    const comments = data?.[1]?.data?.children || [];
    const frag = document.createDocumentFragment();
    comments.forEach(c => {
      const node = renderComment(c, p.author, 0);
      if (node) frag.appendChild(node);
    });
    container.appendChild(frag);
    if (!comments.length) {
      container.appendChild(el('div', 'post-head', 'No comments yet.'));
    }
  } catch (err) {
    spinner.remove();
    container.appendChild(el('div', 'post-head', `Couldn't load comments: ${err.message}`));
  }
}

function renderComment(c, opAuthor, depth) {
  if (c.kind === 'more') {
    if (!c.data?.count) return null;
    return el('button', 'load-more-comments', `+ ${c.data.count} more replies (open on Reddit)`);
  }
  if (c.kind !== 't1') return null;
  const d = c.data;

  const node = el('div', `comment depth-${Math.min(depth, 5)}`);
  node.dataset.cid = d.id;
  const meta = el('div', 'comment-meta');
  meta.appendChild(el('span', 'comment-toggle', '▼'));
  const author = el('span', 'comment-author' + (d.author === opAuthor ? ' op' : ''), `u/${d.author}`);
  meta.appendChild(author);
  meta.appendChild(el('span', 'comment-score', `▲ ${compact(d.score ?? 0)}`));
  meta.appendChild(el('span', null, timeAgo(d.created_utc)));
  meta.onclick = () => node.classList.toggle('collapsed');
  meta.title = 'Collapse / expand thread';
  node.appendChild(meta);

  const body = redditHtml(d.body_html);
  body.className = 'comment-body';
  inlineCommentImages(body);
  node.appendChild(body);

  const replies = d.replies?.data?.children || [];
  let childCount = 0;
  replies.forEach(r => {
    const child = renderComment(r, opAuthor, depth + 1);
    if (child) { node.appendChild(child); childCount++; }
  });
  if (childCount) {
    meta.appendChild(el('span', 'comment-hidden',
      `${childCount} ${childCount === 1 ? 'reply' : 'replies'} hidden`));
  }
  return node;
}

function closeDetail() {
  stopLive();
  overlay.classList.add('hidden');
  paneEl.classList.add('hidden');
  teardownMedia(overlayContent);
  teardownMedia(paneContent);
  overlayContent.innerHTML = '';
  paneContent.innerHTML = '';
  if (selectedCard) {
    selectedCard.classList.remove('selected');
    selectedCard = null;
  }
}
$('#overlay-close').onclick = closeDetail;
$('#overlay-backdrop').onclick = closeDetail;
$('#pane-close').onclick = closeDetail;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const box = $('#lightbox');
    if (box) box.remove();
    else closeDetail();
  }
});

/* drag the divider to resize the comments panel */
const resizer = $('#pane-resizer');
const savedPaneWidth = parseInt(localStorage.getItem('paneWidth'), 10);
if (savedPaneWidth) paneEl.style.width = savedPaneWidth + 'px';

resizer.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  resizer.classList.add('dragging');
  resizer.setPointerCapture(e.pointerId);
  const row = $('#content-row').getBoundingClientRect();

  const onMove = (ev) => {
    const w = Math.round(row.right - ev.clientX);
    paneEl.style.width = Math.max(300, Math.min(w, row.width * 0.7)) + 'px';
  };
  const onUp = () => {
    resizer.classList.remove('dragging');
    resizer.removeEventListener('pointermove', onMove);
    resizer.removeEventListener('pointerup', onUp);
    localStorage.setItem('paneWidth', parseInt(paneEl.style.width, 10) || '');
  };
  resizer.addEventListener('pointermove', onMove);
  resizer.addEventListener('pointerup', onUp);
});

/* comments location toggle */
const modeBtn = $('#mode-toggle');
function updateModeButton() {
  modeBtn.textContent = commentsMode() === 'side' ? '🗨 Side panel' : '🗨 Popup';
}
modeBtn.onclick = () => {
  localStorage.setItem('commentsMode', commentsMode() === 'side' ? 'overlay' : 'side');
  updateModeButton();
  closeDetail();
};
updateModeButton();

/* ---------------- Sidebar collapse ---------------- */
// Ctrl+B is the shortcut every editor already uses for this, and the button
// stays in the topbar rather than the titlebar because a tiling WM hides the
// titlebar entirely (see omarchy.isTilingSession).
const layoutEl = $('#layout');
const sidebarBtn = $('#sidebar-toggle');

function sidebarCollapsed() { return localStorage.getItem('sidebarCollapsed') === '1'; }

function applySidebar() {
  const off = sidebarCollapsed();
  layoutEl.classList.toggle('sidebar-collapsed', off);
  sidebarBtn.textContent = off ? '\u00bb' : '\u00ab';
  sidebarBtn.title = (off ? 'Show sidebar' : 'Collapse sidebar') + ' (Ctrl+B)';
  sidebarBtn.setAttribute('aria-label', sidebarBtn.title);
  sidebarBtn.setAttribute('aria-expanded', String(!off));
}

function toggleSidebar() {
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed() ? '0' : '1');
  applySidebar();
}

sidebarBtn.onclick = toggleSidebar;
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key !== 'b' && e.key !== 'B') return;
  e.preventDefault();
  toggleSidebar();
});
applySidebar();

/* ---------------- Sidebar: my subreddits ---------------- */
const DEFAULT_SUBS = ['pics', 'videos', 'aww', 'technology', 'worldnews', 'gaming', 'movies'];

function getMySubs() {
  try {
    const saved = JSON.parse(localStorage.getItem('mySubs'));
    return Array.isArray(saved) ? saved : [...DEFAULT_SUBS];
  } catch { return [...DEFAULT_SUBS]; }
}
function saveMySubs(subs) { localStorage.setItem('mySubs', JSON.stringify(subs)); }

function renderSidebar() {
  const wrap = $('#my-subs');
  wrap.innerHTML = '';
  for (const name of getMySubs()) {
    const item = el('div', 'side-item');
    item.dataset.feed = `r/${name}`;
    item.appendChild(el('span', 'side-icon', '·'));
    item.appendChild(el('span', null, `r/${name}`));
    const rm = el('button', 'side-remove', '✕');
    rm.title = 'Remove';
    rm.onclick = (e) => {
      e.stopPropagation();
      saveMySubs(getMySubs().filter(s => s !== name));
      renderSidebar();
    };
    item.appendChild(rm);
    item.onclick = () => setFeed(`r/${name}`, `r/${name}`);
    item.classList.toggle('active', state.feed === `r/${name}`);
    wrap.appendChild(item);
  }
}

function addSub(name) {
  name = name.trim().replace(/^\/?(r\/)?/i, '').replace(/\/+$/, '');
  if (!/^\w{2,21}$/.test(name)) return;
  const subs = getMySubs();
  if (!subs.some(s => s.toLowerCase() === name.toLowerCase())) {
    subs.push(name);
    subs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    saveMySubs(subs);
  }
  renderSidebar();
  setFeed(`r/${name}`, `r/${name}`);
}

$('#add-sub-form').onsubmit = (e) => {
  e.preventDefault();
  const input = $('#add-sub-input');
  addSub(input.value);
  input.value = '';
  $('#sub-suggestions').innerHTML = '';
};

/* subreddit autocomplete */
let suggestTimer = null;
$('#add-sub-input').addEventListener('input', (e) => {
  clearTimeout(suggestTimer);
  const q = e.target.value.trim();
  const box = $('#sub-suggestions');
  if (q.length < 2) { box.innerHTML = ''; return; }
  suggestTimer = setTimeout(async () => {
    try {
      const data = await api(`/subreddits/search.json?q=${encodeURIComponent(q)}&limit=6&raw_json=1`);
      box.innerHTML = '';
      for (const c of data?.data?.children || []) {
        const s = c.data;
        if (s.subreddit_type !== 'public') continue;
        const item = el('div', 'sub-suggestion', `r/${s.display_name}`);
        item.appendChild(el('span', 'subs-count', compact(s.subscribers || 0)));
        item.onclick = () => {
          addSub(s.display_name);
          $('#add-sub-input').value = '';
          box.innerHTML = '';
        };
        box.appendChild(item);
      }
    } catch { /* suggestions are best-effort */ }
  }, 300);
});

/* built-in feeds */
$$('#sidebar .side-item[data-feed]').forEach(item => {
  if (item.parentElement.id === 'my-subs') return;
  item.onclick = () => {
    const feed = item.dataset.feed;
    setFeed(feed, item.textContent.trim());
  };
});

/* ---------------- Sorts + search ---------------- */
$$('.sort-btn').forEach(btn => {
  btn.onclick = () => {
    $$('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.sort = btn.dataset.sort;
    $('#top-time').classList.toggle('hidden', state.sort !== 'top');
    resetFeed();
  };
});
$('#top-time').onchange = (e) => { state.topTime = e.target.value; resetFeed(); };

$('#search-form').onsubmit = (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  state.feed = `search:${q}`;
  titleEl.textContent = `Search: ${q}`;
  $$('.side-item').forEach(i => i.classList.remove('active'));
  resetFeed();
};

/* ---------------- Zoom: Ctrl+wheel, Ctrl+=/-/0 ---------------- */
const savedZoom = parseFloat(localStorage.getItem('zoomLevel'));
if (!Number.isNaN(savedZoom)) window.lurk.setZoom(savedZoom);

function zoom(dir) {
  const z = window.lurk.zoomBy(dir);
  localStorage.setItem('zoomLevel', z);
}
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoom(e.deltaY < 0 ? 0.5 : -0.5);
}, { passive: false });
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); zoom(0.5); }
  else if (e.key === '-') { e.preventDefault(); zoom(-0.5); }
  else if (e.key === '0') {
    e.preventDefault();
    window.lurk.setZoom(0);
    localStorage.setItem('zoomLevel', 0);
  }
});

/* ---------------- Read-post tracking ---------------- */
const readPosts = new Set(JSON.parse(localStorage.getItem('readPosts') || '[]'));

function markRead(p, card) {
  if (!readPosts.has(p.id)) {
    readPosts.add(p.id);
    localStorage.setItem('readPosts', JSON.stringify([...readPosts].slice(-2000)));
  }
  if (card) card.classList.add('read');
}

const hideReadBtn = $('#hideread-toggle');
function hideReadOn() { return localStorage.getItem('hideRead') === '1'; }
function applyHideRead() {
  feedEl.classList.toggle('hide-read', hideReadOn());
  hideReadBtn.textContent = hideReadOn() ? '🙈 Read hidden' : '👁 Read shown';
}
hideReadBtn.onclick = () => {
  localStorage.setItem('hideRead', hideReadOn() ? '0' : '1');
  applyHideRead();
};
applyHideRead();

/* ---------------- Live post mode (issue #17) ---------------- */
// Poll the open post every 30s; merge new comments in place with a fading
// glow, keep scroll steady, and surface unseen counts in the title + taskbar.
let live = null;          // { post, unseen, timer }
let lastOpenPost = null;

const LIVE_INTERVAL = 30_000;

const liveBtn = $('#live-toggle');
function liveOn() { return localStorage.getItem('liveMode') !== '0'; }

// The button doubles as the status display: countdown → checking… → result flash
function updateLiveBtn() {
  if (!liveOn()) {
    liveBtn.textContent = '⚪ Live';
    liveBtn.classList.remove('on');
    return;
  }
  liveBtn.classList.add('on');
  if (!live) { liveBtn.textContent = '🔴 Live'; return; }
  if (live.busy) { liveBtn.textContent = '🔴 checking…'; return; }
  if (Date.now() < live.flashUntil) { liveBtn.textContent = `🔴 ${live.flashText}`; return; }
  const secs = Math.max(0, Math.ceil((live.nextAt - Date.now()) / 1000));
  liveBtn.textContent = `🔴 ${secs}s`;
}
liveBtn.onclick = () => {
  localStorage.setItem('liveMode', liveOn() ? '0' : '1');
  if (liveOn() && lastOpenPost && !paneEl.classList.contains('hidden')) startLive(lastOpenPost);
  else stopLive();
  updateLiveBtn();
};
updateLiveBtn();

function startLive(p) {
  stopLive();
  if (!liveOn()) return;
  live = {
    post: p,
    unseen: 0,
    busy: false,
    nextAt: Date.now() + LIVE_INTERVAL,
    flashText: '',
    flashUntil: 0,
    timer: setInterval(liveTick, 1000)
  };
  updateLiveBtn();
}
function stopLive() {
  if (live) { clearInterval(live.timer); live = null; }
  setBadge(0);
  updateLiveBtn();
}

function liveTick() {
  if (!live) return;
  if (!live.busy && Date.now() >= live.nextAt) pollLive();
  updateLiveBtn();
}

async function pollLive() {
  if (!live) return;
  if (document.hidden || paneEl.classList.contains('hidden')) {
    live.nextAt = Date.now() + LIVE_INTERVAL;
    return;
  }
  const p = live.post;
  live.busy = true;
  updateLiveBtn();
  let added = 0;
  let ok = false;
  try {
    const data = await api(`${p.permalink}.json?raw_json=1&limit=80&depth=6&sort=${commentSort()}`);
    if (!live || live.post !== p) return;    // closed or switched mid-fetch
    ok = true;
    const fresh = data?.[0]?.data?.children?.[0]?.data;
    const comments = data?.[1]?.data?.children || [];
    if (fresh) {
      const count = paneContent.querySelector('.comments-count');
      if (count) count.textContent = `${compact(fresh.num_comments)} comments`;
      if (selectedCard) {
        const score = selectedCard.querySelector('.foot-score');
        if (score) score.textContent = `▲ ${compact(fresh.score)}`;
        const btns = selectedCard.querySelectorAll('.foot-btn');
        if (btns[1]) btns[1].textContent = `💬 ${compact(fresh.num_comments)}`;
      }
    }
    added = mergeComments(comments, paneContent, p.author, 0);
    if (added > 0 && !document.hasFocus()) {
      live.unseen += added;
      setBadge(live.unseen);
    }
  } catch { /* transient network error — the flash says so */ }
  if (live && live.post === p) {
    live.busy = false;
    live.nextAt = Date.now() + LIVE_INTERVAL;
    live.flashText = ok ? (added > 0 ? `+${added} new` : 'no new') : 'retrying';
    live.flashUntil = Date.now() + 3000;
    updateLiveBtn();
  }
}

function mergeComments(children, parentEl, opAuthor, depth) {
  let added = 0;
  let prev = null;
  for (const c of children) {
    if (c.kind !== 't1') continue;
    const d = c.data;
    const existing = paneContent.querySelector(`[data-cid="${CSS.escape(d.id)}"]`);
    if (existing) {
      const score = existing.querySelector(':scope > .comment-meta .comment-score');
      if (score) score.textContent = `▲ ${compact(d.score ?? 0)}`;
      added += mergeComments(d.replies?.data?.children || [], existing, opAuthor, depth + 1);
      prev = existing;
      continue;
    }
    const node = renderComment(c, opAuthor, depth);
    if (!node || !node.dataset?.cid) continue;   // 'more' stubs don't merge live
    node.classList.add('comment-fresh');
    if (prev) prev.insertAdjacentElement('afterend', node);
    else if (depth === 0) {
      const header = paneContent.querySelector('.comments-header');
      if (header) header.insertAdjacentElement('afterend', node);
      else paneContent.appendChild(node);
    } else {
      parentEl.appendChild(node);
    }
    // inserting above the viewport must not move what the user is reading
    if (node.getBoundingClientRect().top < paneContent.getBoundingClientRect().top) {
      paneContent.scrollTop += node.offsetHeight;
    }
    prev = node;
    added += 1 + node.querySelectorAll('.comment').length;
  }
  return added;
}

function setBadge(n) {
  document.title = n > 0 ? `(${n > 99 ? '99+' : n}) Lurk` : 'Lurk';
  let dataUrl = null;
  if (n > 0) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#7c6cff';
    ctx.beginPath(); ctx.arc(16, 16, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n > 9 ? '9+' : String(n), 16, 17);
    dataUrl = canvas.toDataURL();
  }
  window.lurk.setBadge(dataUrl, n);
}
window.addEventListener('focus', () => {
  if (live) live.unseen = 0;
  setBadge(0);
});

/* ---------------- Updates ---------------- */
/*
 * Mirrors the main process's updater state (lib/updater.js). Three shapes the
 * user actually sees:
 *
 *   downloading       progress, no action — it is happening on its own
 *   downloaded        "Restart" — auto-update platforms (Windows, AppImage)
 *   available-manual  "Download" — macOS and .deb/.pacman, which can't self-update
 *
 * A dismissal is remembered per version so a background re-check every few
 * hours doesn't re-nag about a release the user already waved off.
 */
const updateToast = $('#update-toast');
const updateText = $('#update-text');
const updateAction = $('#update-action');
const versionEl = $('#app-version');
const checkBtn = $('#check-updates');

function dismissedVersion() { return localStorage.getItem('updateDismissed'); }
function dismissVersion(v) { if (v) localStorage.setItem('updateDismissed', v); }

function hideToast() { updateToast.classList.add('hidden'); }

function showToast(text, actionLabel, onAction) {
  updateText.textContent = text;
  if (actionLabel) {
    updateAction.textContent = actionLabel;
    updateAction.classList.remove('hidden');
    updateAction.onclick = onAction;
  } else {
    updateAction.classList.add('hidden');
    updateAction.onclick = null;
  }
  updateToast.classList.remove('hidden');
}

let lastUpdateState = null;

function renderUpdate(st) {
  if (!st) return;
  lastUpdateState = st;
  if (st.current) versionEl.textContent = `v${st.current}`;

  switch (st.status) {
    case 'downloading':
      if (dismissedVersion() === st.version) return hideToast();
      showToast(
        st.percent != null
          ? `Downloading Lurk ${st.version || ''} — ${st.percent}%`
          : `Downloading Lurk ${st.version || ''}…`,
        null, null);
      break;

    case 'downloaded':
      // Deliberately ignores a prior dismissal: the bits are already on disk
      // and the only thing left is a restart, so it is worth one more ask.
      showToast(`Lurk ${st.version} is ready to install`,
        'Restart', () => window.lurk.updates.install());
      break;

    case 'available-manual':
      if (dismissedVersion() === st.version) return hideToast();
      showToast(`Lurk ${st.version} is available`,
        'Download', () => window.lurk.updates.openReleasePage());
      break;

    default:
      hideToast();
  }
}

$('#update-dismiss').onclick = () => {
  dismissVersion(lastUpdateState?.version);
  hideToast();
};

/* Manual check — the button reports its own result, since a background check
   that finds nothing is otherwise completely silent. */
async function manualCheck() {
  checkBtn.disabled = true;
  const original = 'Check for updates';
  checkBtn.textContent = 'Checking…';
  try {
    const st = await window.lurk.updates.check();
    renderUpdate(st);
    if (st?.status === 'current') checkBtn.textContent = "You're up to date";
    else if (st?.status === 'disabled') checkBtn.textContent = 'Updates off in dev';
    else if (st?.status === 'error') checkBtn.textContent = 'Check failed';
    else checkBtn.textContent = original;
  } catch {
    checkBtn.textContent = 'Check failed';
  }
  setTimeout(() => { checkBtn.textContent = original; checkBtn.disabled = false; }, 3000);
}

function initUpdates() {
  if (!window.lurk?.updates) return;      // older preload; fail quiet
  checkBtn.onclick = manualCheck;
  window.lurk.updates.onState(renderUpdate);
  window.lurk.updates.getState().then(renderUpdate);
}

/* ---------------- Boot ---------------- */
renderSidebar();
setFeed('', 'Frontpage');
initUpdates();
