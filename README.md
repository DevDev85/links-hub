# links.developdevice.com

Link hub for Develop Device (bio link for Instagram, TikTok, YouTube). Plain static site on GitHub Pages, no build step.

- `index.html` – the page; everything works without JavaScript.
- `assets/app.js` – progressive extras: UTM tags on store links (`utm_source=links`), live product counts
  from `developdevice.com/collections/<handle>.json`, the "Trending this week" row from the weekly
  `top-25-this-week` collection (rotated by n8n).
- `assets/styles.css`, `assets/img/`, `assets/fonts/` – design, images and the store fonts (Clash Display, Clash Grotesk).
- `CNAME` – custom domain for GitHub Pages.

## Store data

`scripts/update-data.mjs` bakes the trending cards and product counts into `index.html` every hour
(`.github/workflows/update-data.yml`), so they show without JavaScript and behind blockers. `assets/app.js` still refreshes
them live in the browser when it can. Asset URLs carry `?v=N`; bump it after changing CSS, JS or fonts.

## Editing

Change `index.html`, commit, push to `main`. GitHub Pages publishes in about a minute.

## DNS

`links` CNAME → `<github-user>.github.io` (Shopify admin → Settings → Domains → DNS; names there are relative).
