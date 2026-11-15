# Local media

The local mirror of the R2 bucket. Everything in this folder except this README is
gitignored, so media is never committed.

When `PUBLIC_MEDIA_URL` is unset (local dev), the site loads media from here, using the
same keys as the bucket. Put files here (or produce them with `scripts/encode-media.sh`),
check them with `npm run dev`, then upload the folder with `scripts/upload-media.sh`.

Expected layout:

```
public/media/
├── landing/background.webm     # landing loop (VP9)
├── landing/background.mp4      # landing loop fallback (H.264)
├── about/arian.jpg
├── music/da-smo-se-ranije-sreli.mp3
├── music/tesko-mi-je-zaboravit-tebe.mp3
└── dances/<slug>.mp4, dances/<slug>-poster.jpg
```

A missing file just shows as empty: the page still works.

To test against the real bucket instead, run `PUBLIC_MEDIA_URL=https://media.<your-domain> npm run dev`.
