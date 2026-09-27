#!/usr/bin/env bash
# Render the demo video, then in one final pass: normalise the audio to -14 LUFS (streaming loudness) and re-encode the
# picture as standard-range BT.709 H.264 (Remotion's JPEG frames arrive as full-range BT.601, which some players mis-show).
#   bash scripts/render.sh [out.mp4]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-out/gridlock-atlas-demo.mp4}"
RAW="out/.raw.mp4"
mkdir -p out
npx remotion render src/index.ts GridLockDemo "$RAW" --concurrency="${CONCURRENCY:-4}" --log=info
# two-pass loudnorm: measure, then apply
STATS=$(ffmpeg -hide_banner -i "$RAW" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$STATS" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -hide_banner -loglevel error -y -i "$RAW" \
  -vf "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -preset slow -crf "${CRF:-21}" -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
rm -f "$RAW"
echo "wrote $OUT"
