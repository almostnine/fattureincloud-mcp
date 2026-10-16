#!/usr/bin/env bash
# Costruisce il pacchetto .mcpb per Claude Desktop: un solo file JavaScript, nessun node_modules,
# nessun modulo nativo, quindi nessuna dipendenza dalla versione di Node dell'utente (purché >= 20).
set -euo pipefail
cd "$(dirname "$0")/.."

# Strumenti fuori dal lock file: versione fissa e script di installazione disattivati.
export npm_config_ignore_scripts=true
MCPB="npx -y @anthropic-ai/mcpb@2.1.2"
NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
STAGE=build/mcpb
OUT="dist/${NAME}-${VERSION}.mcpb"

npm run build --silent
npx tsx scripts/gen-manifest.ts

rm -rf "$STAGE"
mkdir -p "$STAGE/dist"
cp dist/index.js "$STAGE/dist/index.js"
cp manifest.json icon.png README.md LICENSE PRIVACY.md "$STAGE/"

# Prova di fumo sul bundle copiato: deve avviarsi senza nulla intorno.
node "$STAGE/dist/index.js" --version >/dev/null

$MCPB validate "$STAGE/manifest.json"
rm -f "$OUT"
$MCPB pack "$STAGE" "$OUT"
shasum -a 256 "$OUT" | tee "$OUT.sha256"

# server.json con l'hash del pacchetto appena costruito
npx tsx scripts/gen-manifest.ts
echo "Pacchetto pronto: $OUT"
