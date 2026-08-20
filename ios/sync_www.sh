#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/frontend/dist"
DEST="$ROOT/ios/NoteApp/www"

if [ ! -f "$DIST/index.html" ]; then
  echo "error: missing $DIST/index.html — run frontend build first" >&2
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete "$DIST/" "$DEST/"
echo "synced $DIST -> $DEST"
