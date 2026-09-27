# links.developdevice.com

Link hub for Develop Device (bio link for Instagram, TikTok, YouTube). Plain static site on GitHub Pages, no build step.

- `index.html` – the page; everything works without JavaScript.
- `assets/app.js` – progressive extras: UTM tags on store links (`utm_source=links`), live product counts
  from `developdevice.com/collections/<handle>.json`, the "Trending this week" row from the weekly
  `top-25-this-week` collection (rotated by n8n).
- `assets/styles.css`, `assets/img/`, `assets/fonts/` – design, images and the store fonts (Clash Display, Clash Grotesk).
- `CNAME` – custom domain for GitHub Pages.

## Store data

`scripts/update-data.mjs` bakes live data into `index.html` every hour (`.github/workflows/update-data.yml`), so the page
is complete without JavaScript and behind blockers: trending (weekly top-25 collection), new releases (newest published
products), plugins & apps, custom services, the 4 latest YouTube videos, the 4 latest blog posts and every product count
(`data-count="<collection>"`). Regions are marked `<!-- data:NAME:start/end -->`. Asset URLs carry `?v=N`; bump it
after changing CSS, JS or fonts.

## Editing

Change `index.html`, commit, push to `main`. GitHub Pages publishes in about a minute.

## DNS

`links` CNAME → `<github-user>.github.io` (Shopify admin → Settings → Domains → DNS; names there are relative).
