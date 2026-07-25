#!/usr/bin/env bash
# Deploys the factory + demo corpus and writes the address file every other
# package reads. The corpus address comes from the factory registry over RPC,
# not from the broadcast artifact — a contract created *by* another contract has
# no named entry there.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"

NETWORK="${NETWORK:-local}"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

if [ "$NETWORK" = "local" ]; then
  # Well-known anvil development keys — never used on a live network.
  DEPLOYER_PK="${PK_DEPLOYER:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
  SCORER_ADDRESS="${SCORER_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"
  CURATOR_ADDRESS="${CURATOR_ADDRESS:-0x14dC79964da2C08b23698B3D3cc7Ca32193d9955}"
  EXPLORER=""
else
  DEPLOYER_PK="${PK_DEPLOYER:?set PK_DEPLOYER for non-local deploys}"
  SCORER_ADDRESS="${SCORER_ADDRESS:?set SCORER_ADDRESS}"
  CURATOR_ADDRESS="${CURATOR_ADDRESS:?set CURATOR_ADDRESS}"
  EXPLORER="https://testnet.monadexplorer.com"
fi
export SCORER_ADDRESS CURATOR_ADDRESS

cd "$ROOT/contracts"
DEPLOY_BLOCK="$(cast block-number --rpc-url "$RPC_URL")"
OUTPUT="$(forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" --broadcast --skip-simulation 2>&1)"

FACTORY="$(echo "$OUTPUT" | grep -o 'FACTORY=0x[0-9a-fA-F]\{40\}' | head -1 | cut -d= -f2)"
if [ -z "$FACTORY" ]; then
  echo "$OUTPUT" >&2
  echo "deploy failed: no factory address in output" >&2
  exit 1
fi

CORPUS="$(cast call "$FACTORY" "corpora(uint256)(address)" 0 --rpc-url "$RPC_URL")"
CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"

mkdir -p "$ROOT/shared/deployments"
cat > "$ROOT/shared/deployments/$NETWORK.json" <<JSON
{
  "network": "$NETWORK",
  "chainId": $CHAIN_ID,
  "rpcUrl": "$RPC_URL",
  "factory": "$FACTORY",
  "corpus": "$CORPUS",
  "deployBlock": $DEPLOY_BLOCK,
  "explorer": "$EXPLORER"
}
JSON

node "$ROOT/scripts/export-abi.mjs"
echo "deployed: factory=$FACTORY corpus=$CORPUS block=$DEPLOY_BLOCK network=$NETWORK"
