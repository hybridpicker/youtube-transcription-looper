#!/usr/bin/env bash
# Builds the release ZIP for the Chrome extension: dist/transcription-looper-<version>.zip
# The version is read from manifest.json. Only files the extension needs are included.
set -euo pipefail

cd "$(dirname "$0")/.."
version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' manifest.json)
[ -n "$version" ] || { echo "No version found in manifest.json" >&2; exit 1; }

out="dist/transcription-looper-${version}.zip"
mkdir -p dist
rm -f "$out"

find manifest.json background.js _locales app shared youtube icons -type f ! -name '.DS_Store' -print \
  | LC_ALL=C sort \
  | zip -X -q "$out" -@

echo "$out ($(du -h "$out" | cut -f1))"
