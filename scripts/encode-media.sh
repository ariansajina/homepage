#!/usr/bin/env bash
# Turn source media into web-ready files under public/media/ (the local mirror of the
# R2 bucket; upload it with scripts/upload-media.sh). Needs ffmpeg.
#
#   scripts/encode-media.sh dance  <input> <key>   # e.g. dances/sprezzatura-solo
#       -> <key>.mp4 (H.264 + AAC, ≤1080p, faststart) and <key>-poster.jpg
#   scripts/encode-media.sh bg     <input> <key>   # e.g. landing/background
#       -> <key>.webm (VP9) and <key>.mp4 (H.264), both silent, for the landing loop.
#          A .webm input is copied as-is (re-encoding dithered footage only makes it bigger).
#   scripts/encode-media.sh audio  <input> <key>   # e.g. music/some-track
#       -> <key>.mp3 (CBR 192k, seekable everywhere)
#   scripts/encode-media.sh image  <input> <key>   # e.g. about/arian
#       -> <key>.jpg (≤1600px wide, quality 85)
#
# "faststart" moves the MP4 index to the front so playback starts before the whole file
# has downloaded; R2 serves byte ranges, so seeking works too.
set -euo pipefail

kind="${1:-}"; in="${2:-}"; key="${3:-}"
if [[ -z "$kind" || -z "$in" || -z "$key" ]]; then
  sed -n '2,16p' "$0"; exit 1
fi
out="$(dirname "$0")/../public/media/$key"
mkdir -p "$(dirname "$out")"
ff=(ffmpeg -hide_banner -loglevel error -y -i "$in")

case "$kind" in
  dance)
    "${ff[@]}" -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" \
      -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$out.mp4"
    ffmpeg -hide_banner -loglevel error -y -ss 1 -i "$out.mp4" -frames:v 1 -vf "scale='min(1280,iw)':-2" -q:v 3 "$out-poster.jpg"
    echo "$out.mp4"; echo "$out-poster.jpg" ;;
  bg)
    if [[ "$in" == *.webm ]]; then cp "$in" "$out.webm"
    else "${ff[@]}" -an -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -pix_fmt yuv420p "$out.webm"; fi
    "${ff[@]}" -an -c:v libx264 -preset slow -crf 34 -pix_fmt yuv420p -movflags +faststart "$out.mp4"
    echo "$out.webm"; echo "$out.mp4" ;;
  audio)
    "${ff[@]}" -vn -c:a libmp3lame -b:a 192k "$out.mp3"
    echo "$out.mp3" ;;
  image)
    "${ff[@]}" -vf "scale='min(1600,iw)':-2" -q:v 3 "$out.jpg"
    echo "$out.jpg" ;;
  *)
    echo "unknown kind: $kind (dance | bg | audio | image)"; exit 1 ;;
esac
