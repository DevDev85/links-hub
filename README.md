# links.developdevice.com

Link hub for Develop Device (bio link for Instagram, TikTok, YouTube). Plain static site on GitHub Pages, no build step.

- `index.html` – the page; everything works without JavaScript.
- `assets/app.js` – progressive extras: UTM tags on store links (`utm_source=links`) and the current year.
- `assets/styles.css`, `assets/img/`, `assets/fonts/` – design, images and the store fonts (Clash Display, Clash Grotesk).
- `favicon.ico`, `assets/img/favicon-32.png`, `favicon.png` (192), `icon-512.png`, `apple-touch-icon.png` (180, opaque) –
  the store's favicon. Remake all of them from the store's icon when it changes and bump their `?v=`.
- `CNAME` – custom domain for GitHub Pages.

## Store data

`scripts/update-data.mjs` bakes live data into `index.html` every hour (`.github/workflows/update-data.yml`), so the page
is complete without JavaScript and behind blockers: trending (weekly top-25 collection), new releases (newest published
products), plugins & apps, the 4 latest YouTube videos, the 4 latest blog posts and every product count
(`data-count="<collection>"`; a new chip with that attribute is picked up by itself). Regions are marked
`<!-- data:NAME:start/end -->`. `assets/styles.css` is the source of truth; the script copies it into the `data:css`
region. Asset URLs carry `?v=N`; bump it after changing CSS, JS, fonts or images.

## Design (15 November 2026)

The page speaks the store's visual language, taken from the theme settings: background `#0a0a0f`, text `#f5f5f7`,
panels `#14141e`, primary button `#5534eb`, accent `#a98bff`, footer `#0e0e14` with a thin top line; buttons 10 px
radius, blocks 40 px on desktop (30 / 22 px on smaller screens), product cards 10 px padding and 8 px image radius,
content up to 1600 px. The background is the house fluted glass drawn with CSS gradients only (`.bg`): static, no
script, no animation. Small uppercase letter-spaced labels (`.kicker`) sit above the section titles.

Rules that every change keeps: no clipped, overlapping or ellipsised text (titles wrap), equal card heights and full
rows in every grid, contrast at least 4.5:1 (3:1 for large text), `width`/`height` on every image, the owner's photo
in natural colours, prices are not shown here, first person singular in the texts.

## Editing

Change `index.html` (and `assets/styles.css`, then copy it into the `data:css` region or let the hourly run do it),
commit, push to `main`. GitHub Pages publishes in about a minute.

## Verification

Browser checks run on a Mac with Playwright, not on the mini PC: `node scripts/verify.cjs OUT_DIR` (set `PW` to the
Playwright module if it is not in `~/refract/node_modules`). It serves the working copy locally and aborts every
request to developdevice.com, so the store is never hit. Chromium and WebKit at 360, 390, 768, 1024, 1440 and 1920 px,
each with the sale on, with the clock past the end of the sale and with JavaScript disabled: page overflow, clipped or
overlapping text, equal heights and full rows, contrast against the rendered pixels, images, local assets, the inline
CSS copy and the data regions. Screenshots and `result.json` land in `OUT_DIR`.

## DNS

`links` CNAME → `<github-user>.github.io` (Shopify admin → Settings → Domains → DNS; names there are relative).

## Free trials

Free 7-day trials are a highlighted quick link and a full-width panel below the header. Both lead to
`/pages/hub#plugin-installers`: no login or order to download; sign-in and the seven-day clock start at activation.
The panel shows the actual ArgWave 3 product image. It is outside the hourly generated regions, so store data updates
preserve it. The number of plugins and apps with a trial is written in three places (quick link, panel text, image
alt) and in the About text.

## Black Friday (12 November 2026)

The first quick link and the first panel lead to `/pages/black-friday` (UTM `utm_campaign=black-friday-2026`): up to
70% off, the lowest prices of 2026 already applied on the product pages, no code; passes and subscriptions are not
discounted. The chrome title is the store's own campaign art (`assets/img/black-friday-title.webp`). Both elements
carry `data-until="2026-11-30T22:59:59Z"` (midnight Central European Time) and an inline script removes every
`[data-until]` element after that moment; the trials link then becomes the filled first link and the quick links
re-flow without an empty cell. After 30 November: nothing to do, it removes itself. The markup, its CSS
(`.bf-promo`, `.sticker`, `.quick__a--bf`) and the two title images can be deleted at any later edit.
