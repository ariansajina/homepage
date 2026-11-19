---
name: upload-media
description: Upload the homepage's local media (public/media/) to the Cloudflare R2 bucket, then verify it. Use when asked to upload, sync or publish media, photos, audio or video to Cloudflare/R2, and before pushing content that refers to new media keys.
---

# Uploading media to R2

Media is never committed: `public/media/` is the local mirror and `homepage-media` on R2
is production. `scripts/upload-media.sh` syncs one to the other (new or changed files
only; nothing is deleted from the bucket).

## Setup (once)

Needs the AWS CLI (`brew install awscli`) and `.env.r2` in the repo root (gitignored by
`.env.*`) with an R2 API token that has Object Read & Write on `homepage-media`:

```
R2_ACCOUNT_ID=...
R2_BUCKET=homepage-media
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Create the token in the Cloudflare dashboard (R2 > Manage API tokens). If `.env.r2` is
missing, ask the user to create it themselves. Never print, log or commit the values.

## Steps

1. Dry run, to see what will be sent: `scripts/upload-media.sh --dryrun`
2. Upload: `scripts/upload-media.sh`. Extra arguments go to `aws s3 sync`, e.g.
   `--exclude "dances/*.mp4"` when the user wants the dance clips left out.
3. Verify with the Cloudflare MCP (`execute`): list
   `GET /accounts/{id}/r2/buckets/homepage-media/objects` and check the new keys exist.
4. Tell the user which keys went up. Only then is it safe to push content that refers to them
   (Railway redeploys on every push to `main`).

Audio is CBR 192k MP3 and video H.264 from `scripts/encode-media.sh`; encode before
uploading if a file is a raw original.
