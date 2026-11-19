#!/usr/bin/env bash
# Upload public/media/ (the local mirror) to the R2 bucket. Only new or changed files are
# sent; nothing is deleted from the bucket. Needs the AWS CLI (R2 speaks the S3 API) and
# an R2 API token with Object Read & Write on the bucket:
#
#   export R2_ACCOUNT_ID=...        # Cloudflare dashboard > R2 > Overview
#   export R2_BUCKET=...            # bucket name
#   export AWS_ACCESS_KEY_ID=...    # from the R2 API token
#   export AWS_SECRET_ACCESS_KEY=...
#   scripts/upload-media.sh
#
# Instead of exporting them, put the four variables in .env.r2 (gitignored) and they are
# loaded automatically. Extra arguments go to `aws s3 sync`, e.g.
#   scripts/upload-media.sh --dryrun                       # show what would be sent
#   scripts/upload-media.sh --exclude "dances/*.mp4"       # skip the big dance clips
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$root/.env.r2" ]; then set -a; . "$root/.env.r2"; set +a; fi
: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID}" "${R2_BUCKET:?set R2_BUCKET}"
src="$root/public/media"

AWS_DEFAULT_REGION=auto aws s3 sync "$src" "s3://$R2_BUCKET" \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
  --exclude ".*" \
  --exclude "README.md" \
  --cache-control "public, max-age=31536000" \
  "$@"
