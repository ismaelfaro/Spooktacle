#!/bin/bash
# Captures a frame of the show with headless Chrome (without opening windows).
#
# Usage: scripts/shot.sh <scene> <seconds> <output.png> [preview|raw] [width] [height]
#   scene: 1..8, or "susto" (the seconds count from within the scare)
#   preview (default): simulates the night projection over the house photo
#   raw: exactly what goes out to the projector
#
# Other commands:
#   scripts/shot.sh bench           → ms per frame for each scene (console)
#   scripts/shot.sh errors <scene> → console errors when drawing that scene

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT
FLAGS=(--headless=new --hide-scrollbars --mute-audio --no-first-run --no-default-browser-check --user-data-dir="$PROFILE")

console() {
  # prints only the page's console messages
  "$CHROME" "${FLAGS[@]}" --window-size=1920,1080 --virtual-time-budget="$2" --enable-logging=stderr --v=0 --dump-dom "$1" 2>&1 >/dev/null \
    | grep -E 'CONSOLE|Uncaught|Error' | sed -E 's/^.*CONSOLE[:(][0-9]+[)]?\] *//' || true
}

case "${1:-}" in
  bench)
    console "file://$ROOT/index.html?show&bench" 2000 | grep BENCH | tr '|' '\n'
    exit 0 ;;
  errors)
    console "file://$ROOT/index.html?show&scene=${2:-1}&t=${3:-5}" 6000
    exit 0 ;;
esac

SCENE="${1:?escena}"; T="${2:?segundos}"; OUT="${3:?salida.png}"
MODE="${4:-preview}"; W="${5:-1920}"; H="${6:-1080}"
if [ "$SCENE" = "susto" ]; then Q="show&pause&scare=$T"; else Q="show&pause&scene=$SCENE&t=$T"; fi
[ "$MODE" = "preview" ] && Q="$Q&preview"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
"$CHROME" "${FLAGS[@]}" --window-size="$W,$H" --virtual-time-budget=2500 --screenshot="$OUT" "file://$ROOT/index.html?$Q" >/dev/null 2>&1
echo "$OUT"
