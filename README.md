# links.developdevice.com

Link hub for Develop Device (bio link for Instagram, TikTok, YouTube). Plain static site on GitHub Pages, no build step.

- `index.html` – the page; everything works without JavaScript.
- `assets/app.js` – progressive extras: UTM tags on store links (`utm_source=links`), live product counts
  from `developdevice.com/collections/<handle>.json`, the "Trending this week" row from the weekly
  `top-25-this-week` collection (rotated by n8n), and the price-step badge that hides itself after its date.
- `assets/styles.css`, `assets/img/` – design and images.
- `CNAME` – custom domain for GitHub Pages.

## Editing

Change `index.html`, commit, push to `main`. GitHub Pages publishes in about a minute.
The dated badge in the pass card (`data-until`) disappears on its own; remove the element when a new one is needed.

## DNS

`links` CNAME → `<github-user>.github.io` (Shopify admin → Settings → Domains → DNS; names there are relative).
