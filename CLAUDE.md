# CLAUDE.md

Guidance for Claude Code (and anyone else) working in this repo.

## What this is

Arian Šajina's homepage. A fully static Astro 7 site (no UI framework, no server) built to
`dist/` and served by Caddy on Railway. Media (video, audio, photos) lives on Cloudflare
R2. There is no CMS or studio: content is Markdown/YAML files in this repo, and publishing
means pushing to `main` (Railway redeploys).

README.md covers the content, media and deploy workflows for humans. docs/stain.md
explains the landing stain.

## Commands

```bash
npm install
npm run dev        # http://localhost:4321 (+ dev-only stain tuner at /dev/stain)
npm run check      # astro check: types + content schemas
npm run build      # static build into dist/ (also validates src/config/landing.yaml)
npm run preview    # serve dist/
npm run format     # prettier --write .
npm run lint       # prettier --check .
npm test           # unit tests for the stain model (tests/*.test.ts, node:test)
npm run test:smoke # browser smoke test (tests/smoke.cjs; starts its own dev server)
```

Hooks in `.claude/settings.json` take care of the routine work, so
don't spend turns on it:

- **After every Write/Edit**, Prettier formats the file (`.claude/hooks/format-file.sh`).
  When it changes something, you're told: re-read before your next exact-match Edit there.
- **Before every `git commit`**, `.claude/hooks/pre-commit-check.sh` runs `astro check`,
  `prettier --check`, `npm test` and `astro build`. It also refuses any media file outside
  `public/media/`. On failure the commit is blocked and you get the last lines of each
  failing check: fix those, then commit again. Don't run the same checks by hand first.

The smoke test is not in the hook (it needs a browser and takes about half a minute):
run `npm run test:smoke` after touching `src/scripts/`, the layouts or the client-router
behaviour, and add a check there when you fix a behaviour bug.

For visual changes, use the `run-homepage` skill
(`node .claude/skills/run-homepage/check.cjs [routes]`): screenshots at desktop and
phone sizes plus an error report in one command. Read only the screenshots you need.

Cloud sessions run `npm ci` in the environment's setup script, so `node_modules` is
already there.

## Map

- `src/pages/`: one file per route: `index.astro` (landing), `about`, `works/` (+ `[slug]`),
  `letters/` (+ `[slug]`), `dances`, `404`.
- `src/layouts/Base.astro`: head/SEO, fonts, `<ClientRouter />` and the two corner decks.
  `Sub.astro` = Base + top bar, for every page but the landing.
- `src/components/`: `Player.astro` and `NextDeck.astro` (both `transition:persist`),
  `TopBar.astro`.
- `src/scripts/`: client behaviour as plain TS modules: `player.ts` (decks + audio),
  `topbar.ts`, `scramble.ts`, `stain.ts`, `landing-video.ts`, `dances.ts`.
- `src/config/landing.yaml`: **all landing tweaks**: menu words, scramble timing,
  background video keys + mask, stain settings. Validated by `src/lib/landing-config.ts`
  (a zod schema); a bad value fails the build with the key's path. So does a stain
  origin that is not on land in the mask.
- `src/lib/stain-model.ts`: the stain model (pure; shared by the landing page and the
  preview). Documented in docs/stain.md. Keep that doc in step with the code.
- `src/dev/`: the stain tuner, injected at `/dev/stain` by a small integration in
  `astro.config.mjs` only when `command === "dev"`. Never part of the build.
- `src/content.config.ts`: collections. Works and letters are Markdown in `src/content/`;
  dances, tracks and upcoming are YAML in `src/data/`.
- `src/lib/media.ts`: the only place that turns an R2 key into a URL (`PUBLIC_MEDIA_URL`,
  or `/media` in local dev → `public/media/`).
- `src/lib/content.ts`: sorted works/letters, date formatting. `src/lib/routes.ts`: every
  route (used by the top bar's random "home").
- `public/landing/coast-mask.png`: the coastline mask (committed; see below).
- `tests/`: `stain-model.test.ts` (unit tests, `npm test`) and `smoke.cjs` (browser
  smoke test, `npm run test:smoke`).
- `scripts/encode-media.sh`, `scripts/upload-media.sh`: the media pipeline. Run locally,
  never in the build.
- `Dockerfile`, `Caddyfile`, `railway.json`: deployment.
- `.claude/`: Claude Code hooks (`settings.json`, `hooks/`) and the `run-homepage` skill.

## Conventions

- **Never commit media.** Videos, audio and photos go to R2. `public/media/` is the local
  mirror, gitignored except its README. The only committed images are the coastline mask
  (it must be same-origin, because the stain reads its pixels) and the favicon.
- Content stores R2 **keys** (`dances/solo.mp4`), never full URLs.
- Tweakable values belong in `src/config/landing.yaml` (with a schema entry), not as
  constants in scripts. Pass config from the `.astro` page to scripts through `data-*`
  attributes as JSON.
- The client router is on, so module scripts run **once per tab**. Per-page setup goes
  in an `astro:page-load` listener, teardown in `astro:before-swap`. Never assume a fresh
  page.
- Persisted elements (`#player`, `#next-deck`) are the same DOM nodes across
  navigations. Other scripts talk to the music through `window` events `music:hold` /
  `music:resume`.
- Colours, fonts and easing are tokens on `:root` in `src/styles/global.css`. Page
  styles live in the page's own `<style>`.
- Honour `prefers-reduced-motion`. Keep every page working at phone width (breakpoint
  600 px). Hover-only styling goes under `@media (hover: hover)`. Use real `<a>` / `<button>`
  elements, and give icon buttons an `aria-label`.
- The letter text is the author's own writing: don't edit its wording beyond what is
  asked.

## Deploy

Railway builds the Dockerfile on every push to `main`. It needs the service variables
`PUBLIC_MEDIA_URL` (required; the build fails without it) and `SITE_URL` (canonical URLs

- sitemap). Caddy serves `dist/` on `$PORT`, with `404.html` for unknown paths.
