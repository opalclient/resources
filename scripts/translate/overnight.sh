#!/usr/bin/env bash
# Overnight translation batch. Every stage is resumable; rerunning the script
# skips completed work (translate-content skips existing files, the pending
# manifest shrinks as keys land).
set -u
cd "$(dirname "$0")/../.."

LOCALES_CONTENT="zh,de,ru,pl,tr,it,ja"

echo "=== STAGE:catalogs start $(date -u +%FT%TZ) ==="
node scripts/translate/translate-pending.mjs
echo "=== STAGE:catalogs done rc=$? ==="

echo "=== STAGE:parity start ==="
node scripts/check-i18n-parity.mjs
echo "=== STAGE:parity done rc=$? ==="

echo "=== STAGE:compliance start ==="
node scripts/translate/translate-compliance.mjs --locales tr,it
echo "=== STAGE:compliance done rc=$? ==="

echo "=== STAGE:content-money start ==="
node scripts/translate/translate-content.mjs --sections compare,blog --locales "$LOCALES_CONTENT"
echo "=== STAGE:content-money done rc=$? ==="

echo "=== STAGE:content-learn start ==="
node scripts/translate/translate-content.mjs --sections learn --locales "$LOCALES_CONTENT"
echo "=== STAGE:content-learn done rc=$? ==="

echo "=== STAGE:all done $(date -u +%FT%TZ) ==="
