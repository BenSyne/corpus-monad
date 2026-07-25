# Monad Blitz Toronto — Hackathon Brief
**Event:** Monad Blitz Toronto · July 25, 2026 · [lu.ma/MonadBlitzTO](https://lu.ma/MonadBlitzTO) · Web3TO × Monad Foundation · kicks off Canada Crypto & AI Week
**Format (standard Blitz):** morning workshops (deploy to testnet) → afternoon build sprint (teams up to 3) → evening live demos, cash prizes by audience vote. One day. Ship the loop, not the whitepaper.

---

## 1. Monad in 60 seconds

Monad is an EVM-compatible Layer-1 built for speed without giving up Ethereum tooling:

- **Performance:** ~10,000 TPS, **300ms blocks**, **600ms finality**
- **How:** MonadBFT consensus, RaptorCast block propagation, **asynchronous (pipelined) execution**, **optimistic parallel execution** + JIT compilation, custom MonadDb state database
- **Compatibility:** full EVM bytecode compatibility + Ethereum RPC compatibility → Foundry, Hardhat, viem, wagmi, MetaMask all work unchanged
- **Status:** mainnet live since Nov 24, 2025. Hackathon builds go on **testnet**.

### Connection details

| | Testnet (build here today) | Mainnet |
|---|---|---|
| Chain ID | **10143** | 143 |
| RPC | `https://testnet-rpc.monad.xyz` | `https://rpc.monad.xyz` |
| Currency | MON | MON |
| Explorer | `https://testnet.monadexplorer.com` | monadvision.com / monadscan.com |
| Faucet | testnet.monad.xyz / faucet.monad.xyz | — |

**Do immediately (faucets rate-limit):** get testnet MON for 2–3 wallets now; deploy a hello-world with Foundry (`forge create --rpc-url https://testnet-rpc.monad.xyz`) to confirm the pipeline before the sprint starts.

---

## 2. THE IDEA: "Corpus" — provenance-backed data royalties for the agent economy

*(Working name; leans into "corpora of data." Alt names: Forage, DataForge, Provenance.)*

**One-liner:** A permissionless market where AI agents get paid **royalties** — not points — for contributing unique, verified data to shared training corpora, and other agents pay per-query to consume it.

**The framing that wins the pitch:** every AI lab is data-constrained; licensing deals (Reddit, Shutterstock, news orgs) prove training data has a price — but only giant platforms can sell today. Agents are the new data collectors. Corpus is the long-tail market: any agent can farm data, provenance is on-chain, and rewards are backed by real buyer revenue, which is what makes the gamification non-abusable.

### The closed loop

1. **Curator creates a Corpus** — schema + taxonomy + optional seed bounty (e.g., "labeled UI screenshots," "rare-language sentence pairs," "Toronto restaurant menus").
2. **Agent contributes:** posts a small MON bond, submits `(contentHash, storageURI)` — data itself on IPFS/Arweave/S3, only hash + metadata on-chain. Exact duplicates auto-rejected on-chain via a content-hash registry.
3. **Scorer evaluates** (trusted oracle today; staked/optimistic committee later): embeds the datum, near-dupe check (cosine similarity vs. existing), classifies into taxonomy cluster, computes **novelty score** = distance to nearest neighbors × cluster-density decay (first sample in an empty region pays most; the 1000th near-dupe pays ~0). Posts score on-chain.
4. **Reward:** contributor is minted **corpus shares** (per-corpus ERC-20) proportional to score. Junk/dupes get zero + partial bond slash.
5. **Buyer pays MON** for access — snapshot purchase or **pay-per-query via an x402-style paid HTTP endpoint** (agents hit a URL, pay 402 invoice, get data; x402 is already big in the Monad ecosystem — SF Blitz was literally "x402 Edition").
6. **Revenue splits:** ~70% pro-rata to shareholders, 20% curator, 10% protocol. **Shares are a perpetual royalty claim tied to provenance** — contribute once, earn every time the corpus sells.
7. **Coverage bounties:** curators/buyers post extra MON on underrepresented clusters ("need more French audio") → demand signals steer agent collection.

### Why the gamification can't be farmed

| Attack | Defense |
|---|---|
| Exact-dupe spam | On-chain content-hash registry → auto-reject, bond slashed |
| Paraphrase/near-dupe spam | Embedding similarity → score ≈ 0 + slash |
| Copying someone's pending submission | Commit-reveal (commit hash, reveal after inclusion) — post-MVP |
| Sybil wallets | Rewards are per-datum, not per-address — splitting gains nothing |
| AI-generated slop floods | Novelty scoring penalizes low-information samples; junk still costs bonds; reputation multiplier slow to earn, fast to lose |
| Data poisoning | Challenge market: stake to dispute a datum, jury re-scores, loser pays winner — roadmap |
| **The root defense** | **Rewards are royalty shares backed by future buyer revenue, not free-floating points. Farming junk earns claims on nothing.** |

### Why on-chain, and why Monad (judges will ask)

- **Why on-chain:** agents owned by different parties need neutral settlement — nobody trusts one company's points DB. Immutable per-datum provenance (who/when/what) is a sellable feature (buyer audits, EU-AI-Act-style training-data provenance). Royalty shares are composable/tradeable → price discovery on which datasets are valuable ("data as an asset class").
- **Why Monad:** per-datum on-chain accounting at agent speed needs 10k TPS + sub-cent fees — dies on Ethereum L1. 600ms finality makes the submit→score→reward loop feel real-time in a live demo. And the contracts are **parallel-execution-friendly by design**: each Corpus has isolated state (own share token, own registry), so submissions to different corpora have disjoint write-sets and Monad executes them concurrently. Say that sentence to the judges.

### MVP cut for ~5 hours (ship the loop, skip the mechanism zoo)

1. **Contracts (Foundry, ~250 lines):** `CorpusFactory`; `Corpus` = submission registry + ERC-20 shares + treasury. Functions: `submit(contentHash, uri)` payable-bond, `postScore(id, score)` onlyScorer → mints shares, `buyAccess()` payable, `distribute()`. **Skip:** commit-reveal, challenges, epochs, reputation.
2. **Scorer service (TS or Python):** listen for Submission events → fetch data → embed (OpenAI/Anthropic API or local MiniLM) → cosine vs. in-memory vector store → novelty score → `postScore` tx.
3. **Contributor agent:** Claude-driven agent with a wallet that gathers/generates schema-valid samples and submits them.
4. **Buyer:** script (or x402 endpoint if time) that pays `buyAccess`, receives the dataset manifest.
5. **Dashboard (Next.js + wagmi):** live corpus view — submissions streaming in, dupes bouncing red, novel data minting shares green, treasury filling, payouts flowing.

### Demo script (3 min)

1. Create corpus live ("Toronto restaurant menus" — local flavor plays well).
2. Launch 3 contributor agents. One is a **copycat** — watch it get zeroed and slashed while originals mint shares. This moment sells the whole mechanism.
3. Buyer agent pays 1 MON → treasury splits → contributor balances tick up on screen.
4. Click one datum → show its provenance manifest on the testnet explorer.
5. Close: "Every reward you saw is a royalty backed by that purchase. Agents farming data, agents buying data, chain keeping score — at 300ms blocks."

**Flagship corpus idea that doubles the story:** make the demo corpus a **model red-team/eval set** — bounties for verified failure cases (jailbreaks, wrong answers). The failures ARE the dataset, labs are the obvious buyers, and it fuses naturally with the royalty mechanism.

---

## 3. Alternative ideas (ranked)

1. **Tollbooth — x402 paywall middleware for MCP tools.** Wrap any MCP server so agents pay per tool call in MON; spend-policy guardrails + a registry of paid tools. Thin contracts, huge demo-wow, dead-on theme. The trade-off: SF Blitz was x402-themed, so it's the "obvious" play — expect neighbors building it.
2. **Red-team bounty market.** Escrowed bounties for verified model-failure cases; judge oracle verifies; failure sets become sellable eval datasets. Best used as Corpus's flagship vertical rather than standalone.
3. **Streaming budget rails for agent orgs.** Orchestrator streams MON per-second to sub-agents with on-chain spend caps and a kill switch. Feasible, cute on 300ms blocks, but a feature more than a company.
4. **Agent escrow labor market.** Task bounties + optimistic verification + reputation NFTs. The most crowded idea at every agent-economy hackathon — skip without a sharp twist.
5. **Agent trust registry + insurance.** Staked identity/vouching, slash-on-scam, insurance pool pricing agent risk. Important infra, weak 3-minute demo.

**Recommendation:** build **Corpus**, demo it with the red-team corpus, name-drop x402 as the buy-side rail. It's differentiated (not another bounty board), it has a real economic loop that closes on stage, and the anti-abuse story gives judges something to chew on.

---

## 4. Pre-sprint checklist

- [ ] Faucet MON into 3 wallets (contributor / scorer / buyer)
- [ ] `forge create` hello-world on testnet — confirm RPC + explorer verification
- [ ] Anthropic/OpenAI API key exported for embeddings
- [ ] Next.js + wagmi template cloned
- [ ] Seed data prepared offline (demo must not depend on live scraping/wifi)

## Sources

- [Monad docs](https://docs.monad.xyz/) · [Network info](https://docs.monad.xyz/developer-essentials/network-information) · [Testnet on Chainlist](https://chainlist.org/chain/10143) · [Faucet](https://faucet.monad.xyz/add-network)
- [Blitz Toronto on Luma](https://lu.ma/MonadBlitzTO) · [Monad events](https://www.monad.xyz/events) · [monadblitz.world](https://monadblitz.world/)
- Theme signals: [Blitz Pune — The Agent Economy](https://luma.com/blitz-pune-july-2026) · [Blitz Mumbai — The Agent Economy](https://luma.com/blitz-mumbai-june-2026) · [Blitz SF — x402 Edition](https://luma.com/monad-blitz-sf)
