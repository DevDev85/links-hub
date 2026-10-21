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

## Free trials (21 October 2026)

Free 7-day trials are the first highlighted quick link and a dedicated full-width
campaign panel directly below the header. Both lead to `/pages/hub#plugin-installers`:
no login or order to download; sign-in and the seven-day clock start at activation.
The panel uses the house fonts and the actual ArgWave 3 product image. It is outside
the hourly generated regions, so store data updates preserve it. `assets/styles.css`
is canonical and its inline `data:css` copy is kept identical.

Browser verification runs on Mac: `node scripts/verify-trials.cjs OUT_DIR` starts a
local preview server; set `LINKS_URL=https://links.developdevice.com/` for read-only
live verification. Chromium/WebKit at 390, 768, 1440 and 1920 px; exact 1600px desktop
content width, image decoding, no page overflow and correct trial destination.
Evidence and final release receipt: `/srv/dd/data/links-hub-trials-20261021/`.
