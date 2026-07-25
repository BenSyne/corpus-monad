# Notes & Research — corpus-data-royalty-market

## Monad facts (verified 2026-07-25)
- L1, EVM bytecode + RPC compatible; MonadBFT, RaptorCast, async + parallel execution, MonadDb
- ~10k TPS, 300ms blocks, 600ms finality; mainnet live since 2025-11-24
- Testnet: chainId 10143, https://testnet-rpc.monad.xyz, explorer testnet.monadexplorer.com, faucet testnet.monad.xyz
- Event: Monad Blitz Toronto (lu.ma/MonadBlitzTO), July 25 2026, Web3TO × Monad Foundation, evening demos, audience-vote prizes
- Ecosystem signals: Pune/Mumbai Blitz themed "The Agent Economy"; SF Blitz "x402 Edition" → agent-payments narrative is hot

## Judge Q&A prep

**"Why on-chain at all?"** Agents owned by different parties need neutral settlement — nobody trusts one company's points database. Provenance per datum (who/when/what, immutable) is a sellable compliance feature. Royalty shares are composable and tradeable → price discovery on datasets as an asset class.

**"Why Monad?"** Per-datum micro-accounting needs 10k TPS and sub-cent fees (dies on L1 Ethereum). 600ms finality makes the submit→score→reward loop feel real-time on stage. Per-corpus isolated state → disjoint write-sets → Monad's parallel execution actually applies to our workload.

**"How is this not farmable?"** Rewards are royalty claims on real revenue, not points. Junk earns claims on nothing and loses half its bond. Exact dupes revert at the door; near-dupes slash; sybil-splitting gains zero because rewards are per-datum; novelty×density decay makes slop flooding unprofitable; wash-trading revenue leaks 30% per cycle.

**"What's centralized today?"** The scorer — a declared v1 trust assumption. Contributors are protected by reclaimBond timeouts; roadmap is staked scorer set / optimistic scoring with challenge windows. We chose honest centralization + a real loop over a fake decentralized mock.

## Decision log

**Decision:** Rewards = per-corpus dividend-bearing ERC-20 (royalty shares), not a global token or points.
**Rationale:** ties every reward to that dataset's real revenue; non-abusable gamification requirement; tradeable = "data as asset class" story. **Consequence:** dividend-accounting complexity (accepted; standard magnified-dividends pattern, fuzz-tested).

**Decision:** Slashed bonds → holder dividend pool (not burn, not curator).
**Rationale:** aligns existing contributors with policing; demo beat: honest agents literally profit from the copycat's slash. **Fallback:** curator when supply == 0.

**Decision:** Pull-payments for every credit (refunds, fees, dividends, bounties).
**Rationale:** kills reentrancy/griefing classes; uniform tests. **Consequence:** demo shows an explicit claim step (fine — it's a visible "agent got paid" beat).

**Decision:** Local deterministic char-3-gram embeddings; no API dependency.
**Rationale:** wifi-off demo, exact vitest values, zero cost. **Consequence:** semantic paraphrase can evade — documented limitation, adapter interface for API embeddings later. Copycat demo uses light edits (realistically caught).

**Decision:** Local content-addressed store (`data/store/<hash>.json`), not IPFS.
**Rationale:** demo reliability; on-chain hash still guarantees integrity. IPFS is a storage adapter away.

**Decision:** Hand-rolled minimal dividend ERC-20, no OpenZeppelin.
**Rationale:** no network dep at build time, smaller audit surface to present, full control of correction math. **Consequence:** we own the correctness burden → dedicated dividend test suite + fuzz invariant.

**Decision:** Demo corpus = "Model Red-Team Evals" (benign, high-level records; no operational attack strings).
**Rationale:** "the failures ARE the dataset" narrative; labs as obvious buyers; safe content.

**Decision:** buyAccess requires exact price; submit requires exact bond.
**Rationale:** no stuck-excess paths, simpler invariants.

## Adversarial review findings

### Round 1 (two independent reviewers: mechanism-design + staff-engineer/demo) — INTEGRATED into PRD v2

**Economic reviewer — CRITICAL:**
1. *Off-topic garbage was the dominant strategy.* Score rewarded distance-from-corpus with no relevance term → unrelated prose scores 700–950 vs honest 550–750, bond fully refunded ⇒ free. 100 records ⇒ ~93% of all royalties for gas. **Fix: relevance floor (centroid cosine ≥ 0.15) + coherence gate.**
2. *Bond under-priced 2–3 orders of magnitude vs the value of a mint.* Break-even spam acceptance rate falls from 29% (1 buyer) to ~1% (50 buyers) to 0.1% (500) — safe only at scales nobody wants. **Fix: 20% non-refundable mint fee to existing holders; 100% slash on reject.**
3. *Padding defeats cosine.* For L2-normalized trigram bags, appending ~24% unique filler drops sim below 0.90 ⇒ verbatim theft + filler beats honest work and *inverts the demo beat*. **Fix: trigram-set containment ≥ 0.80 (length-invariant).**

**Economic reviewer — HIGH:** free minting ⇒ unbounded dilution (mint fee + honesty); curator honeypot (curator==scorer scoring everything 0 harvests bonds; zero-supply routes 90% to curator; unbounded pause enables rug-and-relaunch) ⇒ `scorer != curator`, zero-supply refund, `NoDataYet`, 24h auto-expiring pause; scorer-flood DoS + reclaim-immunized junk ⇒ pending cap 5, timeout bounds, 95% reclaim; hash squatting + authorship front-running ⇒ free `contentSeen` on reject/expire, commit-reveal documented; perpetual access ⇒ 30-day renewable; slash deterrent inverse to stake ⇒ exclude the slashed contributor from its own slash distribution; demo beat calibrated on a weak attack ⇒ golden vitest + 4 attack variants.

**Economic reviewer — MEDIUM/LOW:** bounty flow was discretionary + lockable ⇒ **cut bounties entirely**; wash-trade leak is 10% not 30% (curator cut recoverable; own-factory wash free) ⇒ claim corrected; access enforceability + replayable manifest signature ⇒ encryption at rest + bound signature; dividend transfer edge cases (self-transfer, to-contract) ⇒ tests + guards; claim nits (parallelism is *across* corpora not within one; "ERC-1726 draft" not "standard"; "max 1.0 share/datum" is not a supply cap).

*Credited as sound:* near-dupe spam at 80% catch-rate is genuinely unprofitable at demo params; A-slashes-to-enrich-B doesn't work; pull-payments/CEI correct; MAG=2^128 overflow-safe.

**Technical reviewer — CRITICAL:**
1. *Second consecutive run breaks everything* (stale scorer cursor ahead of fresh chain ⇒ nothing scored; stale accepted-set ⇒ honest records slashed as self-dupes; live old anvil ⇒ `DuplicateContent` on every honest submit). The stage run IS the second run. **Fix: `demo:reset` + scorer self-reset on chain reset + acceptance = two consecutive runs.**
2. *Thresholds unvalidated.* Same-schema English records share a high similarity floor; a "light paraphrase" plausibly lands 0.80–0.88 ⇒ **copycat mints on stage**. **Fix: author seed data FIRST, golden vitest asserting margins, exclude `category` from embedded text.**

**Technical reviewer — HIGH/MEDIUM:** factory-created Corpus address isn't named in `broadcast/*.json` ⇒ read `factory.corpora(0)` over RPC; BigInt `JSON.stringify` throws ⇒ shared serializer; the BLOCKED chip had no data source (revert emits nothing) ⇒ `/events` POST from demo.ts; tsx child orphans + vite port drift ⇒ process-group kill, port preflight, `--strictPort`; missing `score <= 1000`; `withdrawableDividendOf` formula unspecified (divide once, sum in signed magnified space); fuzz the *sequence*, not amounts; hash-mismatch wipeout risk ⇒ one serializer module; CDN fonts contradict wifi-off ⇒ system fonts; sleeps ⇒ await on-chain status; `Promise.all` sends ⇒ duplicate nonces; watcher cursor from deployment block; timeline: seed/threshold work is unbudgeted and load-bearing, phase 7 doubled, bounty "cut" was half a cut.

### Round 2 — (pending)
