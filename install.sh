#!/usr/bin/env bash
set -e

PACKAGE="oceancode"

HAS_NODE=0
HAS_BUN=0

if command -v bun >/dev/null 2>&1; then
  HAS_BUN=1
fi

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed -E 's/^v//' | cut -d '.' -f 1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    HAS_NODE=1
  fi
fi

if [ "$HAS_BUN" -eq 0 ] && [ "$HAS_NODE" -eq 0 ]; then
  echo "Installing Bun runtime environment..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  HAS_BUN=1
fi

INSTALL_BIN=""

if [ "$HAS_BUN" -eq 1 ]; then
  echo "Installing $PACKAGE via Bun..."
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  bun add -g "$PACKAGE"
  INSTALL_BIN="$BUN_INSTALL/bin"
elif command -v pnpm >/dev/null 2>&1; then
  echo "Installing $PACKAGE via pnpm..."
  pnpm add -g "$PACKAGE"
  INSTALL_BIN="$(pnpm bin -g 2>/dev/null || echo '')"
elif command -v yarn >/dev/null 2>&1; then
  echo "Installing $PACKAGE via Yarn..."
  yarn global add "$PACKAGE"
  INSTALL_BIN="$(yarn global bin 2>/dev/null || echo '')"
elif command -v npm >/dev/null 2>&1; then
  echo "Installing $PACKAGE via npm..."
  NPM_PREFIX="$(npm config get prefix 2>/dev/null || echo '')"
  if [ -n "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX" ] && [ "$(id -u)" -ne 0 ]; then
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    export PATH="$HOME/.npm-global/bin:$PATH"
    INSTALL_BIN="$HOME/.npm-global/bin"
  elif [ -n "$NPM_PREFIX" ]; then
    INSTALL_BIN="$NPM_PREFIX/bin"
  fi
  npm install -g "$PACKAGE"
fi

SHELL_NAME="$(basename "$SHELL" 2>/dev/null || echo 'bash')"
PROFILE=""

if [ "$SHELL_NAME" = "zsh" ]; then
  PROFILE="$HOME/.zshrc"
elif [ "$SHELL_NAME" = "bash" ]; then
  if [ -f "$HOME/.bashrc" ]; then
    PROFILE="$HOME/.bashrc"
  elif [ -f "$HOME/.bash_profile" ]; then
    PROFILE="$HOME/.bash_profile"
  fi
fi

if [ -z "$PROFILE" ]; then
  PROFILE="$HOME/.profile"
fi

if [ -n "$INSTALL_BIN" ] && [[ ":$PATH:" != *":$INSTALL_BIN:"* ]]; then
  echo "export PATH=\"$INSTALL_BIN:\$PATH\"" >> "$PROFILE"
  export PATH="$INSTALL_BIN:$PATH"
fi

echo ""
echo "Successfully installed $PACKAGE!"
echo "Run 'oceancode' or 'ocean' to get started."
