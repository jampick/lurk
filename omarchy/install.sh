#!/bin/bash
#
# Install Lurk's Omarchy integration.
#
# Drops the theme template into ~/.config/omarchy/themed/, where Omarchy renders
# it alongside its own templates on every theme switch. Lurk reads the result at
# startup and reloads it live when the theme changes.

set -euo pipefail

THEMED_DIR="$HOME/.config/omarchy/themed"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v omarchy-theme-refresh >/dev/null; then
  echo "Omarchy not found on this system — nothing to install." >&2
  exit 1
fi

mkdir -p "$THEMED_DIR"
cp "$SRC_DIR/lurk.css.tpl" "$THEMED_DIR/lurk.css.tpl"
echo "Installed $THEMED_DIR/lurk.css.tpl"

omarchy-theme-refresh
echo "Rendered $HOME/.local/state/omarchy/current/theme/lurk.css"
echo
echo "Lurk now follows your Omarchy theme. Switch themes with the Omarchy menu"
echo "and any running Lurk window will retint immediately."
