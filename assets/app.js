// Develop Device link hub. The page is complete without JavaScript (store data is baked in hourly by
// scripts/update-data.mjs); this only adds campaign tags, the year and the seamless artist loop.
(function () {
  var STORE = "https://developdevice.com";
  document.querySelectorAll('a[href^="' + STORE + '"]').forEach(function (a) {
    var u = new URL(a.href);
    u.searchParams.set("utm_source", "links");
    u.searchParams.set("utm_medium", "linkhub");
    a.href = u.toString();
  });
  var y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();
  var set = document.querySelector(".marquee__set");
  if (set) { var c = set.cloneNode(true); c.setAttribute("aria-hidden", "true"); set.parentNode.appendChild(c); }
})();
