// Develop Device link hub. Everything here is progressive: the page is complete without JavaScript.
(function () {
  var STORE = "https://developdevice.com";

  // 1. Campaign tags on store links, so the store analytics shows visits from this page.
  document.querySelectorAll('a[href^="' + STORE + '"]').forEach(function (a) {
    var u = new URL(a.href);
    u.searchParams.set("utm_source", "links");
    u.searchParams.set("utm_medium", "linkhub");
    a.href = u.toString();
  });

  var y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();

  // 2. Live product counts from the store (collection JSON is public with CORS *). Fallback numbers stay in the HTML.
  document.querySelectorAll("[data-count]").forEach(function (el) {
    fetch(STORE + "/collections/" + el.getAttribute("data-count") + ".json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.collection && d.collection.products_count > 0) el.textContent = d.collection.products_count; })
      .catch(function () {});
  });

  // 3. Trending: the weekly top-25 collection (rotated by the n8n workflow), first 12 without the pass itself.
  var box = document.querySelector("[data-trend]");
  if (!box) return;
  var kind = function (p) {
    var t = (p.product_type || "") + " " + p.title;
    if (/serum|vital|wavetable|synth/i.test(t)) return "Synth presets";
    if (/midi/i.test(t)) return "Drum MIDI";
    if (/axe-fx|fm3|fm9|helix|kemper|quad cortex|\bnam\b|tonex|\bir\b|patch/i.test(t)) return "Guitar tones";
    if (/superior drummer|ezdrummer|getgood|modo|addictive|drum preset|\bkit\b/i.test(t)) return "Drum preset";
    if (/plugin|\bapp\b|vst/i.test(t)) return "Plugin";
    return "Develop Device";
  };
  fetch(STORE + "/collections/top-25-this-week/products.json?limit=16")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.products || !d.products.length) return;
      var list = d.products.filter(function (p) { return p.handle !== "all-access-pass-annual-membership" && p.images && p.images.length; }).slice(0, 12);
      if (!list.length) return;
      box.innerHTML = "";
      list.forEach(function (p, i) {
        var img = p.images[0].src + (p.images[0].src.indexOf("?") > -1 ? "&" : "?") + "width=400&height=400&crop=center";
        var a = document.createElement("a");
        a.className = "trend__card";
        a.href = STORE + "/products/" + p.handle + "?utm_source=links&utm_medium=linkhub&utm_content=trending";
        a.innerHTML =
          '<span class="trend__media"><span class="trend__rank">#' + (i + 1) + '</span>' +
          '<img loading="lazy" width="400" height="400" alt=""></span>' +
          '<span class="trend__body"><span class="trend__t"></span><span class="trend__k"></span></span>';
        a.querySelector("img").src = img;
        a.querySelector(".trend__t").textContent = p.title.replace(/:.*$/, "");
        a.querySelector(".trend__k").textContent = kind(p);
        box.appendChild(a);
      });
    })
    .catch(function () {});
})();

// Duplicate the artist list once so the marquee loops without a seam.
(function () {
  var set = document.querySelector(".marquee__set");
  if (set) { var c = set.cloneNode(true); c.setAttribute("aria-hidden", "true"); set.parentNode.appendChild(c); }
})();
