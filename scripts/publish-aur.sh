#!/usr/bin/env bash
set -e

AUR_REPO="ssh://aur@aur.archlinux.org/oceancode.git"
TMP_DIR=$(mktemp -d)

if git clone "$AUR_REPO" "$TMP_DIR" 2>/dev/null; then
  cp packaging/aur/PKGBUILD "$TMP_DIR/PKGBUILD"
  cp packaging/aur/.SRCINFO "$TMP_DIR/.SRCINFO"
  cd "$TMP_DIR"
  git add PKGBUILD .SRCINFO
  git commit -m "Release $(grep '^pkgver=' PKGBUILD | cut -d '=' -f 2)"
  git push origin master
else
  cd "$TMP_DIR"
  git init
  git checkout -b master
  cp "$OLDPWD/packaging/aur/PKGBUILD" PKGBUILD
  cp "$OLDPWD/packaging/aur/.SRCINFO" .SRCINFO
  git add PKGBUILD .SRCINFO
  git commit -m "Initial release $(grep '^pkgver=' PKGBUILD | cut -d '=' -f 2)"
  git remote add origin "$AUR_REPO"
  git push -u origin master
fi

rm -rf "$TMP_DIR"
echo "Successfully published oceancode to AUR."
