# CLAUDE.md

Arian Šajina's homepage. Static Astro 7 site (no UI framework, no server), served by Caddy
on Railway; media on Cloudflare R2. See README.md for content, media and deploy workflows.

## Map

- `src/pages/`: one file per route. `index.astro` (landing), `about`, `works/`, `letters/`,
  `dances`, `404`.
- `src/layouts/Base.astro`: head/SEO, fonts, `<ClientRouter />` and the two persisted corner
  decks. `Sub.astro` = Base + top bar, for every page but the landing.
- `src/components/`: `Player.astro`, `NextDeck.astro` (persisted with `transition:persist`),
  `TopBar.astro`.
- `src/scripts/`: client behaviour as plain TS modules. `player.ts` (decks + audio),
  `topbar.ts`, `scramble.ts`, `background.ts` (landing video + stain), `dances.ts`.
- `src/content.config.ts`: collections. Works/letters are Markdown in `src/content/`;
  dances/tracks/upcoming are YAML in `src/data/`.
- `src/lib/media.ts`: the only place that turns an R2 key into a URL.
- `scripts/encode-media.sh`, `scripts/upload-media.sh`: media pipeline (local, never in CI).

## Conventions

- The client router is on, so module scripts run **once per tab**. Per-page setup goes in an
  `astro:page-load` listener and teardown in `astro:before-swap`; never assume a fresh page.
- Persisted elements (`#player`, `#next-deck`) are the same DOM nodes across navigations.
  Other scripts talk to the music via `window` events `music:hold` / `music:resume`.
- Content stores R2 keys, never full media URLs.
- Colours, fonts and easing are tokens on `:root` in `src/styles/global.css`.
- Honour `prefers-reduced-motion`; keep pages working at phone width (breakpoint 600px);
  hover-only styling goes under `@media (hover: hover)`.
- Run `npm run check` and `npm run build` before committing; `npm run format` for style.
