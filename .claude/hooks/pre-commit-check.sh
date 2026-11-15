#!/bin/bash
# PreToolUse hook (Bash): gate every `git commit` on the same checks Railway's build
# depends on, and refuse to commit media. Pushes go straight to main and Railway deploys
# main, so this is the last line of defence. Prints only the tail of whatever failed.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // empty')
if ! printf '%s' "$cmd" | grep -qE '(^|&&|;|\|)[[:space:]]*git commit\b'; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:?}" || exit 0
if [ ! -x node_modules/.bin/astro ]; then
  echo "node_modules is missing: run npm ci, then commit again." >&2
  exit 2
fi

# 1. No media in git. Look at staged files and at every not-ignored file in the tree, so
#    `git add -A && git commit` is caught too. Media belongs in public/media/ (ignored)
#    and on R2. The coastline mask (and the SVG favicon) are the only committed images.
media=$(
  { git diff --cached --name-only --diff-filter=AM; git ls-files --others --exclude-standard; } |
    sort -u |
    grep -iE '\.(mp4|webm|mov|m4v|mkv|mp3|wav|m4a|aac|ogg|flac|jpe?g|heic|gif|webp|avif|png|zip)$' |
    grep -vE '^public/landing/coast-mask\.png$' || true
)
if [ -n "$media" ]; then
  echo "Refusing to commit media files (they belong in public/media/ and on R2):" >&2
  echo "$media" | sed 's/^/  /' >&2
  exit 2
fi

# 2. Checks. astro check, prettier and the unit tests run in parallel; the build runs after
#    (it and astro check both regenerate .astro/, so they must not overlap).
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
run() {
  local name=$1 log=$2
  shift 2
  "$@" >"$log" 2>&1 || printf '%s' "$name" >"$log.failed"
}
run "astro check" "$tmp/1-check" node_modules/.bin/astro check &
run "prettier --check" "$tmp/2-prettier" node_modules/.bin/prettier --check . &
run "npm test" "$tmp/4-test" npm test --silent &
wait
run "astro build" "$tmp/3-build" node_modules/.bin/astro build

failures=""
for log in "$tmp"/?-*; do
  case "$log" in *.failed) continue ;; esac
  [ -f "$log.failed" ] || continue
  failures+=$'\n--- '"$(cat "$log.failed")"$' failed (last 30 lines) ---\n'"$(tail -n 30 "$log")"
done
if [ -n "$failures" ]; then
  echo "Pre-commit checks failed. Fix these, then commit again:$failures" >&2
  exit 2
fi
exit 0
