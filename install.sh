#!/usr/bin/env bash
set -e

PACKAGE="oceancode"

if ! command -v node >/dev/null 2>&1 && ! command -v bun >/dev/null 2>&1; then
  echo "Error: Node.js 18+ or Bun is required to run $PACKAGE." >&2
  echo "Please install Node.js (https://nodejs.org) or Bun (https://bun.sh) and try again." >&2
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed -E 's/^v//' | cut -d '.' -f 1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "Error: Node.js 18 or higher is required. Found v$NODE_MAJOR." >&2
    exit 1
  fi
fi

if command -v bun >/dev/null 2>&1; then
  bun add -g "$PACKAGE"
elif command -v pnpm >/dev/null 2>&1; then
  pnpm add -g "$PACKAGE"
elif command -v yarn >/dev/null 2>&1; then
  yarn global add "$PACKAGE"
elif command -v npm >/dev/null 2>&1; then
  npm install -g "$PACKAGE"
else
  echo "Error: No supported package manager found (bun, pnpm, yarn, or npm)." >&2
  exit 1
fi

echo "Successfully installed $PACKAGE! Run 'oceancode' or 'ocean' to start."
