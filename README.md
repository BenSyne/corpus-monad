# Corpus

**Data royalties for the agent economy.** Built at Monad Blitz Toronto, July 2026.

Agents bond MON and contribute data to shared corpora. A scorer pays for what is genuinely new, on-topic, and not a copy. Buyers pay for access, and that revenue flows to everyone who built the dataset — forever, in proportion to what they added.

The point is that the rewards are **royalty shares backed by real revenue**, not points. That is what makes the incentives hard to farm: minting is never free, junk forfeits its bond, and a claim on nothing is worth nothing.

## Quick start

```bash
pnpm install && pnpm demo:reset --full   # chain + contracts + scorer
pnpm web                                 # dashboard at localhost:5000
pnpm demo                                # run the agent economy
pnpm agent:join                          # an outside agent joins over MCP
```

`pnpm web` serves the scroll-driven 3D **landing page** at `/` and the **live dashboard** at `/app.html`. See [DEMO.md](DEMO.md) for the stage runbook.

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
| `mcp/` | MCP server — how any outside agent joins the market |
| `web/` | Landing page (scroll-driven Three.js) + live dashboard (React + viem) |
| `shared/` | ABIs, content store, config, deployment addresses |
| `data/seed/` | Corpus config and the 15 seed records the demo uses |
| `z_ai_workspace/` | PRD, implementation plan, adversarial review findings |

## Any agent can join

Corpus is an MCP server, so an agent connects with no integration work. `.mcp.json` ships in the repo, so Claude Code picks it up in a session started from this directory; Claude Desktop takes the same block in its config. `pnpm agent:join` runs a scripted MCP client that does the whole loop.

| Tool | What the agent can do |
|---|---|
| `corpus_info` | Ask what the corpus collects, what a record needs, what it pays, how it judges |
| `corpus_contribute` | Stake a bond and submit a record |
| `corpus_check_submission` | Find out the score, the shares minted, or exactly why it was rejected |
| `corpus_my_earnings` | Shares held, royalties claimable, bonds lost |
| `corpus_claim_earnings` | Collect royalties and returned bonds |
| `corpus_buy_access` | Pay for 30 days of read access |
| `corpus_read_data` | Read the records (needs active access) |
| `corpus_recent_activity` | See what this corpus has been accepting and rejecting |

The agent never touches an address, an ABI, or a private key in its reasoning — it reads a spec, contributes, and gets paid.

## Testing

```bash
cd contracts && forge test    # 55 tests, incl. reentrancy + 512-run solvency fuzz
pnpm test:unit                # scoring gates against the real seed data
pnpm e2e                      # boots everything, runs the arc, asserts on-chain state
```

`pnpm e2e` is the real gate: it asserts that honest agents were paid, that each of the four attacks was caught by its specific defense, that the revenue split is exact, that the contract still covers every obligation, and that an outside agent can join over MCP and earn shares. It is expected to pass twice in a row with no cleanup between runs.

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
