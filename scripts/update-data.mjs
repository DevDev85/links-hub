// Bakes live store data into index.html so the page is complete without JavaScript and behind blockers:
// the "Trending this week" cards (weekly top-25 collection, rotated by n8n) and the product counts.
// Runs hourly in GitHub Actions (.github/workflows/update-data.yml). Node 20+, no dependencies.
import { readFile, writeFile } from "node:fs/promises";

const STORE = "https://developdevice.com";
const UTM = "utm_source=links&utm_medium=linkhub";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kind = (p) => {
  const t = `${p.product_type || ""} ${p.title}`;
  if (/serum|vital|wavetable|synth/i.test(t)) return "Synth presets";
  if (/midi/i.test(t)) return "Drum MIDI";
  if (/axe-fx|fm3|fm9|helix|kemper|quad cortex|\bnam\b|tonex|\bir\b|patch/i.test(t)) return "Guitar tones";
  if (/superior drummer|ezdrummer|getgood|modo|addictive|drum preset|\bkit\b/i.test(t)) return "Drum preset";
  if (/plugin|\bapp\b|vst/i.test(t)) return "Plugin";
  return "Develop Device";
};
const get = async (path) => {
  const r = await fetch(STORE + path, { headers: { "user-agent": "links.developdevice.com data refresh" } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

let html = await readFile("index.html", "utf8");
const before = html;

const { products } = await get("/collections/top-25-this-week/products.json?limit=16");
const list = products.filter((p) => p.handle !== "all-access-pass-annual-membership" && p.images?.length).slice(0, 12);
if (list.length >= 3) {
  const cards = list.map((p, i) => {
    const src = p.images[0].src + (p.images[0].src.includes("?") ? "&" : "?") + "width=400&height=400&crop=center";
    return `        <a class="trend__card" target="_blank" rel="noopener" href="${STORE}/products/${p.handle}?${UTM}&amp;utm_content=trending">` +
      `<span class="trend__media"><span class="trend__rank">#${i + 1}</span><img loading="lazy" width="400" height="400" alt="" src="${esc(src)}"></span>` +
      `<span class="trend__body"><span class="trend__t">${esc(p.title.replace(/:.*$/, ""))}</span><span class="trend__k">${kind(p)}</span></span></a>`;
  }).join("\n");
  html = html.replace(/(<!-- trending:start -->\n)[\s\S]*?(\n\s*<!-- trending:end -->)/, `$1${cards}$2`);
}

for (const m of [...html.matchAll(/data-count="([a-z0-9-]+)">(\d+)</g)]) {
  try {
    const { collection } = await get(`/collections/${m[1]}.json`);
    if (collection?.products_count > 0) html = html.replace(m[0], `data-count="${m[1]}">${collection.products_count}<`);
  } catch (e) { console.warn(e.message); }
}

if (html !== before) { await writeFile("index.html", html); console.log("index.html updated"); }
else console.log("no change");
