// Browser verification of the link hub. Runs on the Mac (Playwright Chromium + WebKit), never on the mini PC:
//   node scripts/verify.cjs OUT_DIR
// Serves the working copy locally. Every request to developdevice.com is aborted (the store is never hit);
// cdn.shopify.com and i.ytimg.com images load. Widths 360-1920 in both engines, three states each:
// "sale" (clock 15 Nov 2026), "after" (clock past the end of the sale) and "nojs" (JavaScript disabled).
const { chromium, webkit } = require(process.env.PW || process.env.HOME + '/refract/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');

const out = process.argv[2] || 'verify-out';
const PORT = Number(process.env.PORT || 8876);
const URL0 = `http://127.0.0.1:${PORT}/`;
const WIDTHS = (process.env.WIDTHS || '360,390,768,1024,1440,1920').split(',').map(Number);
const SALE_END = Date.parse('2026-11-30T22:59:59Z');
const STATES = { sale: Date.parse('2026-11-15T12:00:00Z'), after: SALE_END + 1000, nojs: null };
const LIMIT = Number(process.env.JOBS || 12);

// ---------- in-page checks (serialised into the page) ----------
function pageChecks(opts) {
  const fails = [];
  const vw = document.documentElement.clientWidth;
  const sel = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).join('.'); return s; };
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  if (document.documentElement.scrollWidth > innerWidth) fails.push(`horizontal overflow: scrollWidth ${document.documentElement.scrollWidth} > ${innerWidth}`);

  // text: every text node, its line boxes and the element that owns it
  const texts = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,noscript') || !visible(el)) continue;
    let hidden = false; for (let a = el; a; a = a.parentElement) if (getComputedStyle(a).display === 'none') hidden = true;
    if (hidden) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) { fails.push(`text without a box: "${n.nodeValue.trim().slice(0, 40)}" in ${sel(el)}`); continue; }
    texts.push({ el, text: n.nodeValue.trim(), rects });
  }
  const sy = scrollY;
  for (const t of texts) {
    const cs = getComputedStyle(t.el);
    if (cs.textOverflow === 'ellipsis') fails.push(`ellipsis on ${sel(t.el)}`);
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') fails.push(`line clamp on ${sel(t.el)}`);
    // the owning block must not scroll its own content
    let blk = t.el; while (blk && getComputedStyle(blk).display === 'inline') blk = blk.parentElement;
    if (blk && (blk.scrollWidth > blk.clientWidth + 1) && blk.clientWidth > 0) fails.push(`text wider than its box: ${sel(blk)} "${t.text.slice(0, 40)}" ${blk.scrollWidth}>${blk.clientWidth}`);
    for (const r of t.rects) {
      if (r.left < -0.5 || r.right > vw + 0.5) fails.push(`text outside the viewport: "${t.text.slice(0, 40)}" ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
      // clipped by any ancestor that hides overflow
      for (let a = t.el; a && a !== document.documentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (a === document.body) continue;
        if (!/(hidden|clip|auto|scroll)/.test(acs.overflowX + acs.overflowY)) continue;
        if (t.el.closest('.sticker')) break; // rotated label: its line box is the unrotated one, checked by the rotated box below
        const b = a.getBoundingClientRect();
        if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) { fails.push(`text clipped by ${sel(a)}: "${t.text.slice(0, 40)}"`); break; }
      }
    }
    // line height: glyph boxes must fit the line (descenders, percent signs)
    const lh = parseFloat(cs.lineHeight), fs = parseFloat(cs.fontSize);
    if (lh && lh / fs < 1.049 && fs >= 24) fails.push(`display text line-height ${(lh / fs).toFixed(2)} < 1.05: ${sel(t.el)}`);
  }
  // rotated stickers stay inside their panel
  for (const s of document.querySelectorAll('.sticker')) {
    if (!visible(s)) continue; const r = s.getBoundingClientRect(), p = s.closest('.promo').getBoundingClientRect();
    if (r.left < p.left || r.right > p.right || r.top < p.top || r.bottom > p.bottom) fails.push(`sticker outside its panel: ${s.textContent}`);
  }
  // overlap: line boxes of different text nodes must not intersect; text must not sit on a foreign image
  const boxes = []; texts.forEach((t, i) => t.rects.forEach((r) => boxes.push({ i, r, t })));
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const A = boxes[a], B = boxes[b]; if (A.i === B.i) continue;
    // a line box is as tall as the font's content area; lines are judged by their line-height band
    const band = (X) => { const lh = parseFloat(getComputedStyle(X.t.el).lineHeight) || X.r.height, c = (X.r.top + X.r.bottom) / 2, hh = Math.min(lh, X.r.height) / 2; return [c - hh, c + hh]; };
    const [at, ab] = band(A), [bt, bb] = band(B);
    const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), h = Math.min(ab, bb) - Math.max(at, bt);
    if (w > 1.5 && h > 1.5) {
      // two inline runs on one line legitimately share the line box vertically, never horizontally
      fails.push(`text overlap: "${A.t.text.slice(0, 30)}" x "${B.t.text.slice(0, 30)}" (${w.toFixed(1)}x${h.toFixed(1)})`);
    }
  }
  const stickers = [...document.querySelectorAll('.sticker')].filter(visible).map((s) => s.getBoundingClientRect());
  for (const t of texts) { if (t.el.closest('.sticker')) continue; for (const r of t.rects) for (const s of stickers) {
    const w = Math.min(r.right, s.right) - Math.max(r.left, s.left), h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
    if (w > 1 && h > 1) fails.push(`sticker over text: "${t.text.slice(0, 30)}"`);
  } }

  // grids: equal heights in a row, full rows, aligned columns
  const grids = { '.quick': 'a', '.gear': 'a', '.cards': 'a', '.vids': 'a', '.artists': 'li', '.rows': 'a', '.plat': '.plat__col' };
  const gridInfo = {};
  for (const [g, c] of Object.entries(grids)) document.querySelectorAll(g).forEach((grid, gi) => {
    const kids = [...grid.querySelectorAll(':scope > ' + c)].filter(visible);
    const rows = new Map();
    for (const k of kids) { const r = k.getBoundingClientRect(); const key = Math.round(r.top + sy); if (!rows.has(key)) rows.set(key, []); rows.get(key).push(r); }
    const list = [...rows.values()];
    list.forEach((row, ri) => {
      const hs = row.map((r) => r.height); if (Math.max(...hs) - Math.min(...hs) > 0.6) fails.push(`unequal heights in ${g}[${gi}] row ${ri + 1}: ${hs.map((h) => h.toFixed(1)).join('/')}`);
    });
    const per = list.map((r) => r.length);
    if (g !== '.plat' && g !== '.rows' && list.length > 1) {
      const full = Math.max(...per);
      const okQuick = g === '.quick' && per.slice(1).every((n) => n === per[1] || n === full) && per[0] <= full;
      if (!per.every((n) => n === full) && !okQuick) fails.push(`ragged rows in ${g}[${gi}]: ${per.join('/')}`);
      // every row spans the same width
      const spans = list.map((row) => Math.round(Math.max(...row.map((r) => r.right)) - Math.min(...row.map((r) => r.left))));
      if (Math.max(...spans) - Math.min(...spans) > 1) fails.push(`rows of different width in ${g}[${gi}]: ${spans.join('/')}`);
    }
    gridInfo[`${g}[${gi}]`] = per.join('/');
  });
  // blog + tools rows line up on desktop
  const lists = [...document.querySelectorAll('.split .rows')];
  if (lists.length === 2 && innerWidth >= 1100) {
    const [l, r] = lists.map((x) => [...x.querySelectorAll(':scope > a')].map((a) => a.getBoundingClientRect()));
    if (l.length !== r.length) fails.push(`blog/tools lists differ in length: ${l.length}/${r.length}`);
    l.forEach((a, i) => { const b = r[i]; if (b && (Math.abs(a.top - b.top) > 0.6 || Math.abs(a.height - b.height) > 0.6)) fails.push(`blog/tools row ${i + 1} not aligned`); });
  }
  // content column: every section shares the same left and right edge
  const wrap = document.querySelector('main.wrap').getBoundingClientRect();
  for (const s of document.querySelectorAll('main.wrap > header, main.wrap > section, main.wrap > .split')) {
    const r = s.getBoundingClientRect(); if (Math.abs(r.left - wrap.left) > 0.6 || Math.abs(r.right - wrap.right) > 0.6) fails.push(`section off the column: ${sel(s)}`);
  }
  if (innerWidth >= 1920 && Math.round(wrap.width) !== 1600) fails.push(`content width ${wrap.width} != 1600`);
  // hero title: exactly two lines
  const title = document.querySelector('.hero__title'); const tr = document.createRange(); tr.selectNodeContents(title);
  const lines = new Set([...tr.getClientRects()].map((r) => Math.round(r.top))).size;
  if (lines !== 2) fails.push(`hero title has ${lines} lines`);

  // images: attributes, decoded
  const imgs = [...document.images];
  for (const i of imgs) {
    if (!i.getAttribute('width') || !i.getAttribute('height')) fails.push(`img without width/height: ${i.src}`);
    if (!visible(i)) continue;
    if (!(i.complete && i.naturalWidth > 0)) fails.push(`img not loaded: ${i.currentSrc || i.src}`);
    const r = i.getBoundingClientRect(), ar = i.naturalWidth / i.naturalHeight, attr = i.getAttribute('width') / i.getAttribute('height');
    if (i.naturalWidth && Math.abs(ar - attr) / ar > 0.03) fails.push(`img width/height attributes do not match the file: ${i.src} ${attr.toFixed(3)} vs ${ar.toFixed(3)}`);
    if (getComputedStyle(i).objectFit !== 'cover' && i.naturalWidth && Math.abs(r.width / r.height - ar) / ar > 0.03) fails.push(`img distorted: ${i.src}`);
  }

  // content
  const count = (s) => [...document.querySelectorAll(s)].filter(visible).length;
  const body = document.body.innerText;
  // text that is written by hand: everything outside the hourly data regions
  const clone = document.body.cloneNode(true); clone.querySelectorAll('.cards, .vids, .split .block:first-child .rows, script, style').forEach((e) => e.remove());
  const staticText = clone.textContent;
  const sale = [...document.querySelectorAll('[data-until]')];
  if (opts.state === 'after') {
    if (sale.length) fails.push('sale elements still present after the end');
    if (/black friday|70 ?%/i.test(staticText)) fails.push('sale wording left in static text after the end');
    if (count('.quick > a') !== 5) fails.push(`quick links after the sale: ${count('.quick > a')}`);
  } else {
    if (sale.length !== 2) fails.push(`sale elements: ${sale.length}`);
    if (count('.quick > a') !== 6) fails.push(`quick links: ${count('.quick > a')}`);
    const p = document.querySelector('.bf-promo'); const t = p ? p.innerText : '';
    for (const need of [/My biggest sale of the year/, /Up to 70% off/i, /lowest prices of 2026/, /No code needed/i, /Ends Monday 30 November at midnight Central European Time/i, /Passes and subscriptions are not discounted/]) if (!need.test(t)) fails.push(`sale panel misses ${need}`);
    for (const a of document.querySelectorAll('a[href*="/pages/black-friday"]')) { const u = new URL(a.href); if (u.searchParams.get('utm_campaign') !== 'black-friday-2026' || u.pathname !== '/pages/black-friday') fails.push(`sale link: ${a.href}`); }
  }
  if (/\b(we|our|us)\b/i.test(staticText)) fails.push('"we/our" in the hand-written text');
  if (/\b15 plugins/i.test(body)) fails.push('old trial count');
  if (!/16 plugins/.test(body)) fails.push('16 plugins missing');
  if (!document.querySelector('.trial-promo').innerText.includes('first activation')) fails.push('trial activation line missing');
  const trial = new URL(document.querySelector('.trial-promo a').href);
  if (trial.hostname !== 'developdevice.com' || trial.pathname !== '/pages/hub' || trial.hash !== '#plugin-installers') fails.push('trial link target');
  const synth = [...document.querySelectorAll('.plat__col')].find((c) => c.querySelector('h3').textContent === 'Synths');
  const chips = [...synth.querySelectorAll('.chip')].map((c) => `${new URL(c.href).pathname.split('/').pop()}=${c.querySelector('[data-count]').textContent}`).join(' ');
  const wantChips = 'serum-2-presets=31 vital-presets=31 argwave-3-presets=9 massive-xl-presets=6 hydrasynth-presets=6 deepmind-12-presets=12 korg-modwave-multi-poly-presets=3 professional-wavetables=2';
  if (chips !== wantChips) fails.push(`synth chips: ${chips}`);
  const need = { '.gear > a': 4, '.cards--top > a': innerWidth < 760 ? 6 : 12, '.cards--new > a': innerWidth < 760 ? 6 : 8, '.vids > a': 4, '.rows--one > a': 8, '.artists > li': 9, '.socials > a': 5 };
  for (const [s, n] of Object.entries(need)) if (count(s) !== n) fails.push(`${s}: ${count(s)} != ${n}`);
  if (count('.block .cards:not(.cards--top):not(.cards--new) > a') < 6) fails.push('plugins row too short');
  if (!/© 20\d\d Develop Device/.test(body)) fails.push('copyright line');
  if (opts.state !== 'nojs') for (const a of document.querySelectorAll('a[href^="https://developdevice.com"]')) { const u = new URL(a.href); if (u.searchParams.get('utm_source') !== 'links' || u.searchParams.get('utm_medium') !== 'linkhub') fails.push(`utm missing: ${a.href}`); }
  for (const a of document.querySelectorAll('a[target=_blank]')) if (!/noopener/.test(a.rel)) fails.push(`noopener missing: ${a.href}`);
  // owner's photo is never tinted
  const ph = document.querySelector('.hero__photo img'); const pcs = getComputedStyle(ph);
  if (pcs.filter !== 'none' || pcs.mixBlendMode !== 'normal' || pcs.opacity !== '1') fails.push('photo is filtered');
  // no animation anywhere (static page)
  const anim = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).animationName !== 'none').length;
  if (anim) fails.push(`${anim} animated elements`);
  return { fails, texts: texts.length, grids: gridInfo, height: document.documentElement.scrollHeight, links: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('?')[0]))] };
}

// text boxes inside the current viewport, for the contrast pass
function textBoxes() {
  const res = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el || el.closest('script,style')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      // only boxes fully inside this viewport slice are judged here; the slices overlap
      if (r.top < 0 || r.bottom > innerHeight) continue;
      const m = cs.color.match(/[\d.]+/g).map(Number);
      res.push({ x: r.left, y: r.top, w: r.width, h: r.height, c: m, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10), text: n.nodeValue.trim().slice(0, 40), rot: !!el.closest('.sticker') });
    }
  }
  return res;
}
// runs in a blank helper page: worst-case contrast of each box against the pixels really behind it
async function contrastOf({ png, boxes }) {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const outp = [];
  for (const b of boxes) {
    const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y)), w = Math.min(cv.width - x, Math.ceil(b.w)), h = Math.min(cv.height - y, Math.ceil(b.h));
    if (w < 1 || h < 1) continue; const d = cx.getImageData(x, y, w, h).data; const a = b.c.length > 3 ? b.c[3] : 1; const cr = [];
    for (let i = 0; i < d.length; i += 4) {
      const tr = b.c[0] * a + d[i] * (1 - a), tg = b.c[1] * a + d[i + 1] * (1 - a), tb = b.c[2] * a + d[i + 2] * (1 - a);
      const l1 = lum(tr, tg, tb), l2 = lum(d[i], d[i + 1], d[i + 2]); cr.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
    }
    cr.sort((p, q) => p - q);
    outp.push({ text: b.text, size: b.size, weight: b.weight, min: cr[0], p02: cr[Math.floor(cr.length * 0.02)], need: (b.size >= 24 || (b.size >= 18.66 && b.weight >= 700)) ? 3 : 4.5 });
  }
  return outp;
}

// ---------- node side ----------
const head = (p) => new Promise((res) => { http.get(URL0 + p.replace(/^\//, ''), (r) => { r.resume(); res(r.statusCode); }).on('error', () => res(0)); });
const pool = async (jobs, n) => { const results = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; results[k] = await jobs[k](); } })); return results; };

async function run(engineName, browser, width, state, helper) {
  const row = { browser: engineName, width, state, fails: [], stage: 'start' };
  const ctx = await browser.newContext({ viewport: { width, height: width < 760 ? 844 : 900 }, deviceScaleFactor: 1, javaScriptEnabled: state !== 'nojs', reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  let store = 0; const bad = [];
  await page.route(/^https?:\/\/([a-z0-9-]+\.)*developdevice\.com\//, (r) => { if (new URL(r.request().url()).hostname === 'links.developdevice.com') return r.continue(); store++; return r.abort(); });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => { if (!/developdevice\.com/.test(r.url())) bad.push(`failed ${r.url()}`); });
  page.on('pageerror', (e) => row.fails.push(`script error: ${e.message}`));
  if (STATES[state]) await page.addInitScript((t) => { const D = Date; const now = () => t; Date.now = now; /* the page only reads Date.now() and new Date() */ window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }; }, STATES[state]);
  if (state !== 'nojs' && engineName === 'chromium') await page.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {} });
  try {
    page.setDefaultTimeout(45000);
    await page.goto(URL0, { waitUntil: 'load' }); row.stage = 'loaded';
    // scroll through the page so lazy images load, then back
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += 600) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(40); }
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForLoadState('networkidle').catch(() => {});
    if (state !== 'nojs') await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter((i) => i.getBoundingClientRect().width > 0).map((i) => i.decode().catch(() => {}))); });
    else await page.waitForTimeout(1500);
    // CSS background images of the gear tiles
    row.stage = 'images'; const bgBad = state === 'nojs' ? [] : await page.evaluate(async () => { const urls = [...document.querySelectorAll('.gear__tile')].map((t) => (t.getAttribute('style').match(/url\('([^']+)'\)/) || [])[1]); const res = await Promise.all(urls.map((u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 0 ? null : u); i.onerror = () => ok(u); i.src = u; }))); return res.filter(Boolean); });
    bgBad.forEach((u) => row.fails.push(`tile image not loaded: ${u}`));
    const fonts = await page.evaluate(() => ['600 20px "Clash Display"', '400 16px "Clash Grotesk"'].map((f) => document.fonts.check(f)));
    if (fonts.includes(false)) row.fails.push('house fonts not loaded');
    row.stage = 'checks'; const r = await page.evaluate(pageChecks, { state });
    row.fails.push(...r.fails); row.texts = r.texts; row.grids = r.grids; row.height = r.height; row.links = r.links;
    if (state !== 'nojs' && engineName === 'chromium') { row.cls = Number((await page.evaluate(() => window.__cls)).toFixed(4)); if (row.cls > 0.02) row.fails.push(`layout shift ${row.cls}`); }
    row.stage = 'shots';
    const shot = `${out}/${engineName}-${width}-${state}.png`;
    if (engineName === 'chromium' || [390, 1440].includes(width)) await page.screenshot({ path: shot, fullPage: true });
    if (state === 'sale' && [390, 1440].includes(width)) await page.screenshot({ path: `${out}/${engineName}-${width}-top.png` });
    // contrast: viewport slices with the glyphs made transparent, judged against the pixels behind them
    if (state === 'sale') {
      row.stage = 'contrast'; await page.addStyleTag({ content: '*{-webkit-text-fill-color:transparent!important;text-shadow:none!important}' });
      const vh = page.viewportSize().height; let worst = Infinity, n = 0; const low = [];
      for (let y = 0; y < r.height; y += Math.round(vh * 0.6)) {
        await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(30);
        const boxes = (await page.evaluate(textBoxes)).filter((b) => !b.rot);
        const png = (await page.screenshot()).toString('base64');
        const res = await helper.evaluate(contrastOf, { png, boxes });
        for (const c of res) { n++; worst = Math.min(worst, c.p02); if (c.p02 < c.need) low.push(`${c.p02.toFixed(2)}:1 (<${c.need}) "${c.text}" ${c.size}px`); }
      }
      row.contrastBoxes = n; row.contrastWorst = Number(worst.toFixed(2));
      [...new Set(low)].forEach((l) => row.fails.push(`contrast ${l}`));
      // stickers are rotated, so they are judged by their own colours
      row.stickers = await page.evaluate(() => [...document.querySelectorAll('.sticker')].map((s) => { const cs = getComputedStyle(s); return `${s.textContent}: ${cs.color} on ${cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? cs.backgroundImage.slice(0, 60) : cs.backgroundColor}`; }));
    }
    row.storeRequestsBlocked = store;
    bad.forEach((b) => row.fails.push(`request: ${b}`));
    row.stage = 'done';
  } catch (e) { row.fails.push(`exception at ${row.stage}: ${e.message.split('\n')[0]}`); }
  await ctx.close();
  row.pass = row.fails.length === 0;
  return row;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2', xml: 'application/xml', webmanifest: 'application/manifest+json', txt: 'text/plain' };
  const root = process.cwd();
  const server = http.createServer((q, s) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, path.normalize(p));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    s.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(f).pipe(s);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const result = { url: URL0, date: new Date().toISOString(), static: [], rows: [] };
  try {
    // static checks: inline CSS equals the file, data regions intact, every local asset answers 200
    const html = fs.readFileSync('index.html', 'utf8'), css = fs.readFileSync('assets/styles.css', 'utf8').trim();
    const st = (name, ok, note = '') => { result.static.push({ name, ok, note }); };
    const inline = (html.match(/<!-- data:css:start -->\n {2}<style>\n([\s\S]*?)\n {2}<\/style>\n {2}<!-- data:css:end -->/) || [])[1];
    st('inline CSS identical to assets/styles.css', inline === css);
    for (const n of ['css', 'trending', 'new', 'apps', 'videos', 'posts']) st(`region ${n}`, new RegExp(`<!-- data:${n}:start -->\\n[\\s\\S]*?\\n\\s*<!-- data:${n}:end -->`).test(html));
    const locals = new Set(['favicon.ico', 'manifest.webmanifest', '404.html', 'sitemap.xml', 'robots.txt', 'assets/img/icon-512.png', 'assets/img/og.jpg', 'assets/img/develop-device-logo.png']);
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#]+)"/g)) locals.add(m[1]);
    for (const m of html.matchAll(/srcset="([^"]+)"/g)) m[1].split(',').forEach((p) => { const u = p.trim().split(' ')[0]; if (u.startsWith('/')) locals.add(u); });
    for (const m of css.matchAll(/url\("([^"]+)"\)/g)) locals.add(m[1]);
    for (const i of JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8')).icons) locals.add(i.src);
    for (const m of fs.readFileSync('404.html', 'utf8').matchAll(/href="(\/[^"]+)"/g)) locals.add(m[1]);
    locals.delete('/');
    for (const p of locals) { const code = await head(p); st(`asset ${p}`, code === 200, String(code)); }
    const helperBrowser = await chromium.launch(); const helper = await helperBrowser.newPage();
    const engines = { chromium: await chromium.launch(), webkit: await webkit.launch() };
    const jobs = [];
    for (const [name, browser] of Object.entries(engines)) for (const w of WIDTHS) for (const state of Object.keys(STATES)) jobs.push(async () => { let timer; const t = new Promise((res) => { timer = setTimeout(() => res({ browser: name, width: w, state, fails: ['timeout after 150 s'], pass: false }), 150000); }); const row = await Promise.race([run(name, browser, w, state, helper), t]); clearTimeout(timer); return row; });
    result.rows = await pool(jobs, LIMIT);
    await Promise.all([...Object.values(engines), helperBrowser].map((b) => b.close()));
  } finally { server.close(); }
  const failed = result.rows.filter((r) => !r.pass), sfailed = result.static.filter((s) => !s.ok);
  result.pass = !failed.length && !sfailed.length;
  fs.writeFileSync(out + '/result.json', JSON.stringify(result, null, 2));
  for (const s of sfailed) console.log(`STATIC FAIL ${s.name} ${s.note}`);
  for (const r of result.rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.browser} ${r.width} ${r.state} texts=${r.texts} h=${r.height}${r.cls !== undefined ? ' cls=' + r.cls : ''}${r.contrastWorst ? ` contrast>=${r.contrastWorst} (${r.contrastBoxes} boxes)` : ''} blocked=${r.storeRequestsBlocked}${r.fails.length ? '\n   - ' + [...new Set(r.fails)].slice(0, 14).join('\n   - ') : ''}`);
  console.log(`${result.pass ? 'PASS' : 'FAIL'}: ${result.rows.length - failed.length}/${result.rows.length} browser runs, ${result.static.length - sfailed.length}/${result.static.length} static checks`);
  process.exitCode = result.pass ? 0 : 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
