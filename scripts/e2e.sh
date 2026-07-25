#!/usr/bin/env bash
# Boots a chain, deploys, runs the scorer, drives the full agent economy, and
# asserts the on-chain result. Exits non-zero if anything about the loop is wrong.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
cd "$ROOT"

ANVIL_PID=""
SCORER_PID=""

cleanup() {
  # Kill process groups: tsx spawns a child that outlives a plain kill on the parent.
  [ -n "$SCORER_PID" ] && kill -- "-$SCORER_PID" 2>/dev/null
  [ -n "$ANVIL_PID" ] && kill -- "-$ANVIL_PID" 2>/dev/null
  lsof -ti:8545,8787 2>/dev/null | xargs kill -9 2>/dev/null
  return 0
}
trap cleanup EXIT INT TERM

echo "› clearing ports and stale state"
lsof -ti:8545,8787 2>/dev/null | xargs kill -9 2>/dev/null
rm -rf "$ROOT/data/store" "$ROOT/scorer/state.json"
mkdir -p "$ROOT/data/store"
sleep 1

echo "› starting anvil"
set -m
anvil --block-time 1 --silent > "$ROOT/.anvil.log" 2>&1 &
ANVIL_PID=$!
set +m
sleep 2.5

echo "› deploying contracts"
if ! bash "$ROOT/scripts/deploy-local.sh" > "$ROOT/.deploy.log" 2>&1; then
  tail -20 "$ROOT/.deploy.log"
  echo "E2E FAILED: deploy"
  exit 1
fi

echo "› starting scorer"
set -m
npx tsx "$ROOT/scorer/src/index.ts" > "$ROOT/.scorer.log" 2>&1 &
SCORER_PID=$!
set +m
sleep 3.5

if ! grep -q "state API" "$ROOT/.scorer.log"; then
  tail -20 "$ROOT/.scorer.log"
  echo "E2E FAILED: scorer did not start"
  exit 1
fi

echo "› running the demo arc with assertions"
if npx tsx "$ROOT/agents/src/demo.ts" --fast --assert; then
  echo ""
  echo "E2E PASSED"
  exit 0
else
  echo ""
  echo "E2E FAILED: demo assertions"
  exit 1
fi
