// Bakes live data into index.html so the page is complete without JavaScript and behind blockers.
// Regions are marked <!-- data:NAME:start --> ... <!-- data:NAME:end -->; counts are data-count="<collection>".
// Sources: the store's public JSON (developdevice.com), the blog Atom feed and the YouTube channel feed.
// Runs hourly in GitHub Actions (.github/workflows/update-data.yml). Node 20+, no dependencies.
import { readFile, writeFile } from "node:fs/promises";

const STORE = "https://developdevice.com";
const YT_CHANNEL = "UCK-8L5Trd0tgSrAZk6egk0Q"; // youtube.com/@developdevicestudio
const UTM = "utm_source=links&amp;utm_medium=linkhub";
const SKIP = (p) => p.handle === "all-access-pass-annual-membership" || /^\(demo\)/i.test(p.title) || !p.images?.length;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const img = (src, w, h) => src + (src.includes("?") ? "&" : "?") + `width=${w}&height=${h}&crop=center`;
const short = (t) => t.replace(/:.*$/, "").trim();
const kind = (p) => {
  const t = `${p.product_type || ""} ${p.title}`;
  if (/serum|vital|wavetable|synth/i.test(t)) return "Synth presets";
  if (/midi/i.test(t) && !/humaniz|convert/i.test(t)) return "Drum MIDI";
  if (/plugin|\bapp\b|vst|humaniz|convert/i.test(t)) return "Plugin";
  if (/axe-fx|fm3|fm9|helix|kemper|quad cortex|\bnam\b|tonex|\bir\b|patch|profile/i.test(t)) return "Guitar tones";
  if (/template/i.test(t)) return "DAW template";
  if (/superior drummer|ezdrummer|getgood|modo|addictive|drum preset|\bkit\b|sdx|ezx/i.test(t)) return "Drum preset";
  return "Develop Device";
};
const A = (href, cls, inner) => `<a class="${cls}" target="_blank" rel="noopener" href="${href}">${inner}</a>`;
// Responsive product images: the browser picks 200/300/400 px by the real card width (the CDN already serves WebP/AVIF).
const SIZES = {
  six: "(min-width: 1100px) calc((min(100vw - 56px, 1600px) - 70px) / 6), (min-width: 760px) calc((100vw - 86px) / 4), 44vw",
  eight: "(min-width: 1100px) calc((min(100vw - 56px, 1600px) - 98px) / 8), (min-width: 760px) calc((100vw - 86px) / 4), 44vw",
};
const srcset = (src) => [200, 300, 400].map((w) => `${esc(img(src, w, w))} ${w}w`).join(", ");
const pcard = (p, label, rank, sizes = SIZES.six) => A(`${STORE}/products/${p.handle}?${UTM}`, "pcard",
  `<span class="pcard__media">${rank ? `<span class="pcard__rank">#${rank}</span>` : ""}<img loading="lazy" decoding="async" width="400" height="400" alt="${esc(short(p.title))}" src="${esc(img(p.images[0].src, 400, 400))}" srcset="${srcset(p.images[0].src)}" sizes="${sizes}"></span>` +
  `<span class="pcard__body"><span class="pcard__t">${esc(short(p.title))}</span><span class="pcard__k">${esc(label)}</span></span>`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The store rate-limits bursts (HTTP 429): space requests out and retry with a growing pause.
const get = async (url, type = "json") => {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt ? 3000 * attempt : 350);
    const r = await fetch(url, { headers: { "user-agent": "links.developdevice.com data refresh" } });
    if (r.status === 429) continue;
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return type === "json" ? r.json() : r.text();
  }
  throw new Error(`${url}: HTTP 429 after retries`);
};
const products = async (handle, limit) => (await get(`${STORE}/collections/${handle}/products.json?limit=${limit}`)).products;

let html = await readFile("index.html", "utf8");
const before = html;
const put = (name, body) => {
  const re = new RegExp(`(<!-- data:${name}:start -->\\n)[\\s\\S]*?(\\n\\s*<!-- data:${name}:end -->)`);
  if (body) html = html.replace(re, `$1${body}$2`);
};
const job = async (name, fn) => { try { put(name, await fn()); } catch (e) { console.warn(`${name}: ${e.message}`); } };

await job("trending", async () => {
  const list = (await products("top-25-this-week", 20)).filter((p) => !SKIP(p)).slice(0, 12);
  return list.length >= 3 ? list.map((p, i) => pcard(p, kind(p), i + 1)).join("\n") : "";
});

await job("new", async () => {
  let all = [];
  for (let page = 1; page <= 5; page++) {
    const { products: batch } = await get(`${STORE}/products.json?limit=250&page=${page}`);
    all = all.concat(batch);
    if (batch.length < 250) break;
  }
  const list = all.filter((p) => !SKIP(p) && p.published_at).sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 8);
  const month = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return list.length >= 3 ? list.map((p) => pcard(p, `${kind(p)} · ${month(p.published_at)}`, 0, SIZES.eight)).join("\n") : "";
});

await job("apps", async () => {
  const list = (await products("apps", 30)).filter((p) => !SKIP(p)).slice(0, 12);
  return list.length ? list.map((p) => pcard(p, p.product_type || "Plugin")).join("\n") : "";
});

await job("services", async () => {
  // Only real custom services (same rule as the store's "Fully booked" badge); software in the collection is left out.
  const list = (await products("premium-custom-services", 10)).filter((p) => !SKIP(p) && /Custom Services/.test(p.product_type || "")).slice(0, 4);
  return list.length ? list.map((p) => A(`${STORE}/products/${p.handle}?${UTM}`, "svc",
    `<img loading="lazy" width="160" height="160" alt="${esc(short(p.title))}" src="${esc(img(p.images[0].src, 160, 160))}">` +
    `<span class="svc__tx"><b>${esc(short(p.title))}</b><small>${esc(p.title.includes(":") ? p.title.split(":").slice(1).join(":").trim() : p.product_type || "")}</small></span><span class="go" aria-hidden="true">→</span>`)).join("\n") : "";
});

await job("videos", async () => {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL}`, "text");
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4).map((m) => ({
    id: m[1].match(/<yt:videoId>([^<]+)/)?.[1],
    title: unesc(m[1].match(/<title>([^<]+)/)?.[1] || ""),
  })).filter((v) => v.id);
  return entries.length ? entries.map((v) => A(`https://www.youtube.com/watch?v=${v.id}`, "vid",
    `<span class="vid__media"><img loading="lazy" width="480" height="270" alt="${esc(v.title)}" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg"><span class="vid__play" aria-hidden="true"></span></span>` +
    `<span class="vid__t">${esc(v.title)}</span>`)).join("\n") : "";
});

await job("posts", async () => {
  const xml = await get(`${STORE}/blogs/news.atom`, "text");
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4).map((m) => ({
    url: m[1].match(/<link[^>]*href="([^"]+)"/)?.[1],
    title: unesc(m[1].match(/<title>([^<]+)/)?.[1] || ""),
    date: m[1].match(/<published>([^<]+)/)?.[1],
  })).filter((e) => e.url);
  const d = (s) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return entries.length ? entries.map((e) => A(`${e.url}${e.url.includes("?") ? "&amp;" : "?"}${UTM}`, "row row--post",
    `<span class="row__tx"><b>${esc(e.title)}</b><small>${d(e.date)}</small></span><span class="go" aria-hidden="true">→</span>`)).join("\n") : "";
});

for (const m of [...html.matchAll(/data-count="([a-z0-9-]+)">(\d*)</g)]) {
  try {
    // Count what a visitor actually sees: products.json lists only published products, while
    // collections/<handle>.json products_count also includes hidden ones (e.g. retired plugin versions).
    let count = 0;
    for (let page = 1; ; page++) {
      const { products: batch } = await get(`${STORE}/collections/${m[1]}/products.json?limit=250&page=${page}`);
      count += batch.length;
      if (batch.length < 250) break;
    }
    if (count > 0) html = html.replace(m[0], `data-count="${m[1]}">${count}<`);
  } catch (e) { console.warn(`count ${m[1]}: ${e.message}`); }
}

// Inline the stylesheet (no render-blocking request); assets/styles.css stays the source of truth.
put("css", `  <style>\n${(await readFile("assets/styles.css", "utf8")).trim()}\n  </style>`);

if (html !== before) {
  await writeFile("index.html", html);
  const today = new Date().toISOString().slice(0, 10);
  await writeFile("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://links.developdevice.com/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>\n</urlset>\n`);
  console.log("index.html updated");
}
else console.log("no change");
