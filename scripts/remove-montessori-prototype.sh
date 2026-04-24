#!/usr/bin/env bash
#
# Remove the Mitable-for-Montessori frontend prototype from the monorepo.
#
# What this does
#   1. Deletes apps/montessori (source, configs, node_modules/build artifacts).
#   2. Removes the "dev:montessori" script entry from the root package.json.
#   3. Deletes the root package-lock.json so npm rewrites workspace links on
#      the next install.
#
# What this does NOT touch
#   - No database tables, no remote resources. This prototype is frontend-only
#     with in-memory mock data, so there is nothing remote to clean up.
#
# Usage:
#   bash scripts/remove-montessori-prototype.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONTESSORI_DIR="$ROOT_DIR/apps/montessori"
PKG_JSON="$ROOT_DIR/package.json"

echo "→ Mitable for Montessori cleanup"
echo "   repo: $ROOT_DIR"

if [[ -d "$MONTESSORI_DIR" ]]; then
    echo "→ Removing $MONTESSORI_DIR"
    rm -rf "$MONTESSORI_DIR"
else
    echo "   apps/montessori already gone — skipping."
fi

if [[ -f "$PKG_JSON" ]] && grep -q '"dev:montessori":' "$PKG_JSON"; then
    echo "→ Removing dev:montessori script from root package.json"
    ( cd "$ROOT_DIR" && node -e "
        const fs = require('fs');
        const p = 'package.json';
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j.scripts && j.scripts['dev:montessori']) {
            delete j.scripts['dev:montessori'];
            fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
            console.log('   ✓ removed');
        } else {
            console.log('   (no dev:montessori script found)');
        }
    " )
else
    echo "   dev:montessori script not present — skipping."
fi

if [[ -f "$ROOT_DIR/package-lock.json" ]]; then
    echo "→ Removing root package-lock.json so npm rewrites workspace links on next install"
    rm -f "$ROOT_DIR/package-lock.json"
fi

echo
echo "✔ Montessori prototype removed."
echo "  Next steps:"
echo "    1) npm install       # regenerate the workspace lockfile"
echo "    2) git status        # review the diff (package.json, removed apps/montessori)"
