#!/bin/bash
# Analyzes a scene's soundtrack without speakers: renders it offline with headless Chrome,
# prints levels (peak, RMS, clipping, silences, events) and saves waveform + spectrogram.
#
# Usage: scripts/audio.sh <scene 1-8|susto> [output.png] [from_seconds] [duration]
#      scripts/audio.sh sfx <name> [output.png]      (a single effect: wolf, creak, cackle…)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${1:-}" = "sfx" ]; then
  Q="sfx=${2:?nombre}&secs=5"; OUT="${3:-$PWD/audio-sfx-$2.png}"
else
  Q="scene=${1:?escena}"; OUT="${2:-$PWD/audio-$1.png}"
  [ -n "${3:-}" ] && Q="$Q&from=$3"
  [ -n "${4:-}" ] && Q="$Q&secs=$4"
fi
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
node "$ROOT/scripts/cdp.mjs" "file://$ROOT/tools/audio-lab.html?$Q" "$OUT" 'document.title === "listo" || document.getElementById("info").textContent.startsWith("ERROR")' 1880 1000 120000 \
  | sed -E 's/^\[log\] //' | tr '|' '\n'
