#!/usr/bin/env bash
# Regenerates the PNG app icons from public/pwa-icon.svg (needs ImageMagick: `magick`).
# Run from the frontend folder after changing the SVG; commit the results.
#
#   icon-192.png / icon-512.png   rounded, transparent corners ("any" purpose)
#   icon-maskable-512.png         full-bleed square; the mark sits inside the 80% safe zone, so
#                                 any platform mask (circle, squircle ...) crops only background
#   apple-touch-icon.png          180x180, opaque (iOS draws its own rounded corners)
#   favicon-32.png                browser tab
set -euo pipefail
cd "$(dirname "$0")/.."
SVG=public/pwa-icon.svg
OUT=public/icons
FULL="$(mktemp --suffix=.svg)"
# Square, full-bleed version of the same artwork: drop the rounded corners and the inner border.
sed -e 's/ rx="112"//' -e '/stroke="#334155"/d' "$SVG" > "$FULL"

render() { magick -background none -density 384 "$1" -resize "${3}x${3}" -depth 8 "$2"; }
render "$SVG" "$OUT/icon-512.png" 512
render "$SVG" "$OUT/icon-192.png" 192
render "$SVG" "$OUT/favicon-32.png" 32
render "$FULL" "$OUT/icon-maskable-512.png" 512
magick -background '#0f172a' -density 384 "$FULL" -resize 180x180 -alpha remove -alpha off -depth 8 "$OUT/apple-touch-icon.png"
rm -f "$FULL"
ls -l "$OUT"
