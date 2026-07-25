# Going live on Monad testnet

Right now the hosted dashboard reads `127.0.0.1`, which means it only works on the
machine running the local chain. Pointing it at Monad testnet makes it work for
everyone, on any device, with no local setup.

Two steps need you (they involve keys and faucet funds). Everything else is done.

---

## Step 1 — make two wallets and fund one

Generate throwaway wallets. Do not reuse a wallet that holds anything real.

```bash
cast wallet new   # run twice: one deployer, one curator
```

Each prints an **Address** and a **Private key**. You need:

- **deployer** — needs testnet MON. Paste its address into https://faucet.monad.xyz
- **curator** — address only, no funds needed
- **scorer** — a third address, only if you want live scoring (it signs a tx per
  submission, so fund it too). The factory requires scorer ≠ curator.

0.5 MON per funded wallet is plenty.

## Step 2 — deploy

```bash
cp .env.example .env      # paste in PK_DEPLOYER, SCORER_ADDRESS, CURATOR_ADDRESS
export $(grep -v '^#' .env | xargs)
NETWORK=testnet RPC_URL=https://testnet-rpc.monad.xyz bash scripts/deploy-local.sh
```

That writes `shared/deployments/testnet.json` with the contract addresses.
Commit and push it — it contains no secrets, only public addresses.

```bash
git add shared/deployments/testnet.json && git commit -m "deploy: Monad testnet" && git push
```

---

## Step 3 — point the hosted site at it (Replit)

Set these as Replit **Secrets** (or env vars), using the values printed by the deploy:

| Key | Value |
|---|---|
| `VITE_RPC_URL` | `https://testnet-rpc.monad.xyz` |
| `VITE_CHAIN_ID` | `10143` |
| `VITE_CORPUS_ADDRESS` | the `corpus` address from `testnet.json` |
| `VITE_EXPLORER` | `https://testnet.monadexplorer.com` |

Redeploy. The dashboard now reads the public chain, so **anyone** who opens the
link sees real data — no local stack required.

### Optional: live scoring for everyone

Without a running scorer, submissions stay `pending` and the dashboard shows chain
data without the "why" text — it degrades gracefully by design. To score live, run
`pnpm scorer` somewhere always-on with `PK_SCORER` set, expose it publicly, and add:

| Key | Value |
|---|---|
| `VITE_SCORER_API` | the public URL of that scorer |

Free Replit instances sleep, so for a judged demo the local scorer on your laptop
is the more reliable option.

---

## Sanity check

```bash
cast call <CORPUS_ADDRESS> "submissionCount()(uint256)" --rpc-url https://testnet-rpc.monad.xyz
```

Returns a number → you're live.
