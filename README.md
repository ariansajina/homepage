# homepage

Arian Šajina's homepage: a static [Astro](https://astro.build) site, served by Caddy on
[Railway](https://railway.com), with media (video, audio, images) on Cloudflare R2.

- **Landing**: four menu words that scramble between English, German, Italian and Croatian
  (Latin, Cyrillic, Glagolitic), over a looping video revealed by a stain spreading out
  from the island of Vis.
- **About**, **Works** (a diagonal timeline + one page per work), **Letters** (long-form
  essays), **Dances** (a grid of short videos that play full screen) and **Conversations**
  (a shelf of books, films, podcasts and pages, filterable by kind).
- A **music player** and a **"where to find me next"** ticker in the top-right corner. Both
  survive page navigation (Astro's client router + `transition:persist`), so the music keeps
  playing while visitors move around.

## Running locally

```bash
npm install
npm run dev          # http://localhost:4321
```

Media is read from `public/media/` when `PUBLIC_MEDIA_URL` is unset. That folder mirrors
the R2 bucket, and everything in it except its README is gitignored, so media is never
committed. Unzip the media bundle into it (or use `scripts/encode-media.sh`) to see the
video, photo and music locally. To use the real bucket instead:
`PUBLIC_MEDIA_URL=https://media.<your-domain> npm run dev`.

The stain tuner at <http://localhost:4321/dev/stain> exists only on the dev server.

```bash
npm run build        # static site in dist/
npm run preview      # serve dist/
npm run check        # type + content-schema check
npm test             # unit tests for the stain model
npm run test:smoke   # browser smoke test (needs Playwright + Chromium; see tests/smoke.cjs)
npm run format       # prettier
```

## Content

Everything is files in this repo:

| What                  | Where                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Works                 | `src/content/works/<slug>.md`: front matter (title, year, date, credits, shows, link) + a one-paragraph description |
| Letters               | `src/content/letters/<slug>.md`: front matter (title, published, edited?, description, cover?) + Markdown body      |
| Dances                | `src/data/dances.yaml` (title, length, `video` + `poster` R2 keys; empty video = grey placeholder)                  |
| Conversations         | `src/data/conversations.yaml` (title, by, kind, note, optional `href` and `pics`; shelf order = file order)         |
| Music                 | `src/data/tracks.yaml` (play order; `src` = R2 key)                                                                 |
| Where to find me next | `src/data/upcoming.yaml` (empty list hides the button)                                                              |
| About                 | `src/pages/about.astro`                                                                                             |
| Landing words         | `src/config/landing.yaml`                                                                                           |

Media fields hold an R2 **key** such as `dances/sprezzatura.mp4`, never a full URL;
`src/lib/media.ts` turns it into a URL.

Inside a letter, media goes in the Markdown as HTML, e.g.
`<figure class="wide"><img src="https://media.example.com/letters/x.jpg" alt="…"><figcaption>…</figcaption></figure>`
(`wide` reaches past the text column, `pair` puts two side by side).

A letter's `cover` takes `type` (`image` or `video`), `src` (R2 key), `alt`, and optionally
`caption`. For an image, also give its pixel `width` and `height`, so the text doesn't
jump when it loads. An image cover is also the letter's picture in link previews; every
other page uses `about/arian.jpg`.

## Media on R2

1. **Encode** with `scripts/encode-media.sh` (needs ffmpeg). It writes into `public/media/`:
   ```bash
   scripts/encode-media.sh dance ~/Movies/solo.mov dances/solo     # solo.mp4 + solo-poster.jpg
   scripts/encode-media.sh audio ~/Music/track.wav music/track      # track.mp3
   scripts/encode-media.sh image ~/Pictures/me.heic about/arian     # arian.jpg
   scripts/encode-media.sh bg    background.webm landing/background # .webm + .mp4 loop
   ```
   Videos are H.264 MP4 with "faststart", so playback starts immediately; R2 serves byte
   ranges, so seeking works.
2. **Reference** the key in content (`video: dances/solo.mp4`, `poster: dances/solo-poster.jpg`).
3. **Upload** `public/media/` to the bucket (only new/changed files are sent), with the AWS
   CLI and an R2 API token:
   ```bash
   export R2_ACCOUNT_ID=… R2_BUCKET=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…
   scripts/upload-media.sh
   ```
   Or drag the files into the bucket in the Cloudflare dashboard, keeping the same paths.

Files the site expects in the bucket today:

```
landing/background.webm
landing/background.mp4
about/arian.jpg
music/da-smo-se-ranije-sreli.mp3
music/tesko-mi-je-zaboravit-tebe.mp3
```

The coastline mask (`public/landing/coast-mask.png`) stays in the repo: it is applied to
the video at runtime, and the stain reads its pixels, which requires the same origin. How
the stain works and how to tune it: [docs/stain.md](docs/stain.md).

### One-time R2 setup

1. Cloudflare dashboard → R2 → create a bucket.
2. Bucket → Settings → **Custom Domains** → connect e.g. `media.<your-domain>` (the domain's
   DNS must be on Cloudflare). Don't use the `r2.dev` URL in production; it is rate-limited.
3. R2 → **Manage API tokens** → create a token with _Object Read & Write_ on that bucket
   (for `scripts/upload-media.sh`).

No CORS rules are needed: the site only plays and displays media, it never reads its bytes
from script.

## Deploying on Railway

The site builds to static files and is served by Caddy (`Dockerfile`, `Caddyfile`,
`railway.json`).

1. Railway → New Project → Deploy from GitHub repo → this repo. Railway picks up
   `railway.json` and builds the `Dockerfile`.
2. Service → **Variables**:
   - `PUBLIC_MEDIA_URL` = `https://media.<your-domain>` (required; the build fails without it)
   - `SITE_URL` = `https://<your-domain>` (canonical URLs, Open Graph and `sitemap-index.xml`)
3. Service → Settings → Networking → **Custom Domain** → add your domain, then create the
   CNAME record Railway shows in Cloudflare DNS (set to _DNS only_, grey cloud, so Railway
   can issue the certificate).

Every push to the default branch redeploys.
