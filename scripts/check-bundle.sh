#!/usr/bin/env bash
# Prova il bundle costruito con MCP Inspector: tool esposti per modalità e portabilità degli schemi.
set -euo pipefail
cd "$(dirname "$0")/.."
BUNDLE=${1:-dist/index.js}
export npm_config_ignore_scripts=true
INSPECTOR="npx -y @modelcontextprotocol/inspector@2.9.0 --cli"

count() {
  local extra=()
  if [ -n "${3:-}" ]; then extra=(-e "FIC_EXTRA_TOOLS=$3"); fi
  $INSPECTOR node "$BUNDLE" -e FIC_MODE="$1" ${extra[@]+"${extra[@]}"} --method tools/list --strict 2>/dev/null \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).tools.length))"
}

expect() {
  local got
  got=$(count "$1" "$2" "${3:-}")
  if [ "$got" != "$2" ]; then echo "Modalità $1 ${3:-}: attesi $2 tool, trovati $got"; exit 1; fi
  echo "Modalità $1${3:+ + $3}: $got tool"
}

expect readonly 17
expect write 26
expect full 28
expect valore-non-valido 17
expect readonly 18 fic_create_entity
expect readonly 17 fic_send_email
