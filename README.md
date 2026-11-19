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
| CMS                   | `src/config/cms.yml` (the forms at `/admin/`; see [Editing with the CMS](#editing-with-the-cms))                    |
| About                 | `src/pages/about.astro`                                                                                             |
| Landing words         | `src/config/landing.yaml`                                                                                           |
| Feature flags         | Env vars (see `.env.example`): `FEATURE_TRACES=true` shows the Conversations page; unset or `false` hides it        |

Media fields hold an R2 **key** such as `dances/sprezzatura.mp4`, never a full URL;
`src/lib/media.ts` turns it into a URL.

Inside a letter, media goes in the Markdown as HTML, e.g.
`<figure class="wide"><img src="https://media.example.com/letters/x.jpg" alt="…"><figcaption>…</figcaption></figure>`
(`wide` reaches past the text column, `pair` puts two side by side).

A letter's `cover` takes `type` (`image` or `video`), `src` (R2 key), `alt`, and optionally
`caption`. For an image, also give its pixel `width` and `height`, so the text doesn't
jump when it loads. An image cover is also the letter's picture in link previews; every
other page uses `about/arian.jpg`.

## Editing with the CMS

[Sveltia CMS](https://sveltiacms.app) runs at **`/admin/`** on the live site: a form for
every work, letter and list in the table above. Saving commits straight to `main`, so
Railway redeploys a minute later, just like a push. If a value breaks a content schema,
the Railway build fails and the live site stays as it was.

- **Media is not uploaded through the CMS.** Upload it to R2 first
  (`scripts/upload-media.sh`), then type its key into the field.
- Letters and work descriptions are edited as raw Markdown, so the `<figure>` HTML and the
  text are saved exactly as typed.
- The CMS rewrites a whole file when it saves: `src/data/*.yaml` lose their header
  comments, and flow-style lists in front matter become block style. The values don't
  change. (The output already matches Prettier.)
- The configuration is `src/config/cms.yml`. Its fields mirror `src/content.config.ts`:
  add a field to both.
- Locally, `npm run dev` and open <http://localhost:4321/admin/>, then **Work with Local
  Repository** (Chrome or Edge) and pick this folder. That edits your checkout directly;
  nothing is committed.

### One-time sign-in setup

GitHub sign-in goes through the [Sveltia CMS Authenticator](https://github.com/sveltia/sveltia-cms-auth),
a small Cloudflare Worker (free plan), with a GitHub App that can only reach this repo.

1. **Deploy the Worker**: open
   <https://deploy.workers.cloudflare.com/?url=https://github.com/sveltia/sveltia-cms-auth>
   and follow the steps, on the same Cloudflare account as R2. Note the Worker URL,
   `https://sveltia-cms-auth.<subdomain>.workers.dev`.
2. **Register a GitHub App**: open the
   [pre-filled form](https://github.com/settings/apps/new?name=Sveltia+CMS+Auth+for+homepage&url=https://github.com/sveltia/sveltia-cms-auth&webhook_active=false&contents=write&pull_requests=write).
   Set **Callback URL** to `<Worker URL>/callback` and leave the rest as filled in
   (Contents and Pull requests read & write, webhook off, only on this account). Create
   it, copy the **Client ID**, then **Generate a new client secret** and copy it.
3. **Install the app**: on the app's page → **Install App** → your account → **Only select
   repositories** → this repo.
4. **Configure the Worker**: Cloudflare → Workers → `sveltia-cms-auth` → Settings →
   Variables and secrets:
   - `GITHUB_CLIENT_ID` = the Client ID
   - `GITHUB_CLIENT_SECRET` = the client secret (type _Secret_)
   - `ALLOWED_DOMAINS` = your site's hostname, e.g. `example.com` (only pages on it can
     get a token)
5. **Point the site at it**: Railway → service → Variables → `CMS_AUTH_URL` = the Worker
   URL (no trailing slash). Redeploy.

Then open `https://<your-domain>/admin/` → **Sign In with GitHub**. Anyone with write
access to the repo can sign in. Until `CMS_AUTH_URL` is set, `/admin/` offers only
**Sign In Using Access Token** (a fine-grained GitHub token with Contents read & write on
this repo).

The CMS itself loads from unpkg at a pinned version (`src/pages/admin/index.astro`); to
upgrade, change the version there.

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
landing/juga.mp4
about/arian.jpg
about/arian.png
letters/email.png
letters/use-signal.png
letters/breaking-olympics-1.png
letters/breaking-olympics-2.png
works/delaj.mp4
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
   - `CMS_AUTH_URL` = the sign-in Worker's URL (optional; see
     [Editing with the CMS](#one-time-sign-in-setup))
3. Service → Settings → Networking → **Custom Domain** → add your domain, then create the
   CNAME record Railway shows in Cloudflare DNS (set to _DNS only_, grey cloud, so Railway
   can issue the certificate).

Every push to the default branch redeploys.
