# Corpus

**Data royalties for the agent economy.** Built at Monad Blitz Toronto, July 2026.

Agents bond MON and contribute data to shared corpora. A scorer pays for what is genuinely new, on-topic, and not a copy. Buyers pay for access, and that revenue flows to everyone who built the dataset — forever, in proportion to what they added.

The point is that the rewards are **royalty shares backed by real revenue**, not points. That is what makes the incentives hard to farm: minting is never free, junk forfeits its bond, and a claim on nothing is worth nothing.

## Quick start

```bash
pnpm install && pnpm demo:reset --full   # chain + contracts + scorer
pnpm web                                 # dashboard at localhost:5173
pnpm demo                                # run the agent economy
```

See [DEMO.md](DEMO.md) for the stage runbook.

## How it works

1. **Curator** creates a corpus: a schema, a taxonomy, and the domain vocabulary that defines its scope.
2. **Contributor agent** posts a 0.1 MON bond and submits a content-addressed record.
3. **Scorer** runs seven gates in order — schema, hash integrity, length, coherence, corpus scope, similarity, containment — then scores what survives on novelty (0–1000) and mints that many royalty shares.
4. **Rejected work forfeits its whole bond** to existing shareholders. Accepted work pays a 20% mint fee to the holders it dilutes, and gets the rest of the bond back.
5. **Buyers** pay 1 MON for 30 days of access. Every purchase splits 70% to shareholders, 20% curator, 10% protocol — on-chain, immediately.
6. **Everyone claims** by pull payment. Nothing is ever pushed to an address.

## Layout

| Path | What's in it |
|---|---|
| `contracts/` | `Corpus.sol` (the money), `CorpusFactory.sol`, 55 Foundry tests |
| `scorer/` | Chain watcher, the scoring gates, state API on :8787 |
| `agents/` | Honest contributors, three attackers, buyer, demo orchestrator |
| `web/` | Read-only dashboard (Vite + React + viem) |
| `shared/` | ABIs, content store, config, deployment addresses |
| `data/seed/` | Corpus config and the 15 seed records the demo uses |
| `z_ai_workspace/` | PRD, implementation plan, adversarial review findings |

## Testing

```bash
cd contracts && forge test    # 55 tests, incl. reentrancy + 512-run solvency fuzz
pnpm test:unit                # scoring gates against the real seed data
pnpm e2e                      # boots everything, runs the arc, asserts on-chain state
```

`pnpm e2e` is the real gate: it asserts that honest agents were paid, that each of the four attacks was caught by its specific defense, that the revenue split is exact, and that the contract still covers every obligation. It is expected to pass twice in a row with no cleanup between runs.

## Known limitations

We would rather state these than have someone find them:

- **The scorer is a trusted oracle.** It cannot take funds, but it decides what gets minted. `reclaimBond` protects contributors from a scorer that goes offline, not from one that turns hostile. Staked or optimistic scoring is the fix.
- **Character-level similarity misses deep paraphrase.** Catching a genuine semantic rewrite needs model embeddings; the gate interface is built for that swap.
- **Slash exclusion is per-address**, so a contributor holding shares in a second wallet still recovers part of their own slash. That is an identity problem, and `test_slashExclusionIsBypassableWithASecondWallet` proves it rather than hiding it.
- **No revocation.** An accepted record that later turns out to be wrong keeps earning. A challenge market is the answer.
- **Submissions can be front-run** on a public mempool. Commit-reveal binding the hash to the sender fixes it.
- **Contributors hold the content key**, so encryption gates non-participants only.

## Network

Runs on local anvil by default. Monad testnet: chain ID 10143, `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadexplorer.com`.
