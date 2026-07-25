#!/usr/bin/env bash
# Puts the machine back to a clean pre-demo state. This exists because the run
# that matters is always the *second* one: a stale chain, a stale scorer cursor,
# or a leftover process on a port will each break the demo in a way that looks
# like a bug in the product.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"

echo "› freeing ports 8545 (chain), 8787 (scorer)"
lsof -ti:8545,8787 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "anvil" 2>/dev/null || true
pkill -f "scorer/src/index.ts" 2>/dev/null || true
sleep 1

echo "› wiping stored content and scorer state"
rm -rf "$ROOT/data/store" "$ROOT/scorer/state.json"
mkdir -p "$ROOT/data/store"

if [ "${1:-}" = "--full" ]; then
  echo "› starting a fresh chain"
  nohup anvil --block-time 1 --silent > "$ROOT/.anvil.log" 2>&1 &
  sleep 2
  echo "› deploying"
  bash "$ROOT/scripts/deploy-local.sh"
  echo "› starting the scorer"
  nohup npx tsx "$ROOT/scorer/src/index.ts" > "$ROOT/.scorer.log" 2>&1 &
  sleep 2
  echo "ready — run: pnpm demo"
else
  echo "clean. start the chain with: pnpm chain"
fi
