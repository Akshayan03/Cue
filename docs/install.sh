#!/bin/bash
# Installs the latest Cue on a Mac:
#
#   curl -fsSL https://akshayan03.github.io/Cue/install.sh | bash
#
# Downloads the right build for this Mac from GitHub Releases, puts Cue.app in
# Applications, and opens it. Files downloaded with curl aren't quarantined, so
# macOS opens Cue without the "unidentified developer" block.
set -euo pipefail

REPO="Akshayan03/Cue"
DEST="${CUE_INSTALL_DIR:-/Applications}"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS. On Windows, download Cue-Setup from https://github.com/$REPO/releases/latest" >&2
  exit 1
fi

# hw.optional.arm64 is 1 on Apple Silicon, even when this shell runs under Rosetta.
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
  pattern='-arm64-mac\.zip$'
else
  pattern='[0-9]-mac\.zip$'
fi

release="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")"
url="$(printf '%s' "$release" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"/\1/' | grep -E -e "$pattern" | head -n 1 || true)"
version="$(printf '%s' "$release" | grep -o '"tag_name": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | head -n 1 || true)"
if [ -z "$url" ]; then
  echo "Couldn't find a Mac download in the latest release. Get it from https://github.com/$REPO/releases/latest" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading Cue ${version}…"
curl -fL --progress-bar "$url" -o "$tmp/Cue.zip"
ditto -x -k "$tmp/Cue.zip" "$tmp"

# Replace a running copy cleanly.
if pgrep -xq Cue; then
  osascript -e 'quit app "Cue"' >/dev/null 2>&1 || true
  sleep 2
fi

# /Applications is writable for admin accounts; fall back to ~/Applications.
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi
rm -rf "$DEST/Cue.app"
ditto "$tmp/Cue.app" "$DEST/Cue.app"
xattr -dr com.apple.quarantine "$DEST/Cue.app" 2>/dev/null || true

echo "✓ Cue ${version} is installed in $DEST."
if [ -z "${CUE_NO_OPEN:-}" ]; then
  echo "Opening Cue. It will walk you through connecting your Claude account."
  open "$DEST/Cue.app"
fi
