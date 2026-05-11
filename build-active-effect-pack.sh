#!/usr/bin/env bash
# Rebuild the `active-effects` compendium pack from JSON sources.
#
# Edit JSON files under `packs/_source/active-effect/` (one file per effect,
# organized into compendium-folder subdirectories), then run this script
# to rebuild the leveldb at `packs/characters/active-effect/`.
#
# Usage: bash build-active-effect-pack.sh
# Requires: npx (auto-installs @foundryvtt/foundryvtt-cli on first run)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Packing active-effect compendium from packs/_source/active-effect → packs/characters/active-effect ..."
rm -rf packs/characters/active-effect
npx --yes @foundryvtt/foundryvtt-cli@3 package pack active-effect \
  --in packs/_source/active-effect \
  --out packs/characters \
  --type System \
  --id vagabond \
  --recursive

echo "Done. Verify packs/characters/active-effect contains: CURRENT, MANIFEST-*, *.log, *.ldb"
ls packs/characters/active-effect | head -10

echo ""
echo "To regenerate the inventory doc:"
echo "  node scripts/generate-ae-inventory.mjs"
