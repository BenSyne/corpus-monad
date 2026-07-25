# PRD — corpus-data-royalty-market

**Status:** v2 — adversarial review round 1 integrated (economics + technical). Round 2 pending.
**Date:** 2026-07-25 · **Target ship:** today (Monad Blitz Toronto, evening showcase)
**Owner:** Ben (ideation/approval/stage demo) · Claude (docs/build/test)
**Approval gate:** Ben pre-approved verbally ("when you're happy with it, launch into goal mode and build"), conditional on two adversarial review rounds being run and integrated before code.

---

## 1. Executive Summary

### Problem
AI labs are data-constrained and pay eight figures for licensed corpora, but only giant platforms can sell. Agents are becoming the best data collectors on earth, yet there is no neutral market where an agent can contribute data, prove provenance, and get paid. Naive "points for data" systems die by farming: duplicates, padded copies, off-topic novelty gaming, sybils, and AI slop.

### Solution
**Corpus**: an on-chain data-royalty market on Monad. Curators create themed corpora. Agents post a bond and submit content-addressed (encrypted-at-rest) data. A scorer enforces a **narrow accept band — novel *and* on-topic *and* coherent *and* not a padded copy** — then mints **per-corpus dividend-bearing ERC-20 royalty shares** proportional to a novelty score. Buyers pay MON for 30-day access; revenue splits 70/20/10 to holders/curator/protocol via pull-payments.

**The economic spine (v2, post-review):** minting is never free — 20% of every accepted bond is a **non-refundable mint fee paid to existing holders**, so every new share compensates the holders it dilutes. Rejected submissions lose **100%** of bond to the holder pool (excluding the rejected contributor). Junk therefore costs money, and rewards are royalty claims on real revenue rather than free-floating points.

### Success criteria
1. Full economic loop runs **live on stage in under 3 minutes** on local anvil, wifi off, from `DEMO.md` commands alone — and runs **twice consecutively** on the same machine without manual cleanup.
2. **Four distinct attacks all visibly fail** on stage: verbatim dupe (reverts at the door), padded copy (containment reject), paraphrase (similarity reject), off-topic slop (relevance/coherence reject) — while honest contributors claim real dividends from the buyer's payment *and* the attackers' slashed bonds.
3. Every funds-moving path covered by Foundry tests incl. attack + fuzz; `pnpm e2e` asserts final on-chain state; dashboard verified in-browser.
4. Judge questions have crisp, honest, pre-written answers — including the ones about what's centralized and what v1 doesn't solve (§5, notes doc).

---

## 2. Technical Implementation Plan

### 2.1 Architecture

```
[Honest agents]  ─submit(bond, hash, uri)─▶ ┌──────────────┐
[Copycat: 3 attacks]                        │  Corpus.sol   │◀─ buyAccess(MON) ─ [Buyer agent]
[Slopbot: off-topic]                        │  shares +     │
        │ write convergent-encrypted blob   │  dividends    │─▶ credits/dividends (PULL only)
        ▼                                   └──────────────┘
[data/store/<hash>.bin]  ◀─read/decrypt─ [Scorer] ─postScore─▲   ▲ deployed by CorpusFactory.sol
                                             │ gates+score        (registry → address export)
                                             ▼
                                   [state API :8787] ─▶ [Dashboard :5173 (read-only)]
                                     /state (metadata)      + reads chain directly via viem
                                     /manifest (access-gated, signature-bound)
                                     /events (demo revert feed)
```

- **Chain:** anvil local (demo default, `--block-time 1`) / Monad testnet 10143 (encore). Native MON only.
- **No DB.** Scorer state = JSON file (self-resetting on chain reset). Content = local content-addressed store of **convergently-encrypted** blobs.
- **Trust model v1 (stated plainly):** the scorer is a single trusted oracle and holds the corpus content key. Contributors are protected against an *absent* scorer by `reclaimBond()`; against a *hostile* one they are not — that is the honest v1 limitation with a staked/optimistic-scoring roadmap (§5.1 #7).

### 2.2 Content handling — convergent encryption (one shared module)

`shared/src/contentStore.ts` is the **only** place bytes are serialized, hashed, written, or read. Both agents and scorer use it (prevents the classic hash-mismatch wipeout).

```
canonicalJson(obj)                     // stable key order, no whitespace → exactly the bytes we hash
iv     = sha256(plaintext)[0:12]       // convergent: identical plaintext → identical ciphertext
cipher = AES-256-GCM(corpusKey, iv, plaintext)
blob   = iv || authTag || cipher       // written to data/store/<hash>.bin
hash   = keccak256(blob)               // this is the on-chain contentHash
```

Why it matters: (a) the on-chain hash commits to the *encrypted* bytes, so anyone can verify integrity without seeing the data — and **identical data still collides on-chain**, which is what makes door-level dupe-blocking work; (b) it makes "what does 1 MON buy?" a real answer — the buyer receives the key, not just a receipt. Documented limitation: convergent encryption leaks equality (that's the point) and the scorer holds the key in v1.

### 2.3 Contracts (Solidity ^0.8.24, Foundry)

**CorpusFactory.sol** — `createCorpus(name, symbol, schemaURI, scorer, curator, bondAmount, accessPrice, scoreTimeout, accessDuration)`; registry array + `CorpusCreated`. Validation (all from review): `scorer != curator` (kills the honeypot), both non-zero, `bondAmount > 0 && bondAmount <= type(uint96).max`, `accessPrice > 0`, `scoreTimeout ∈ [5 min, 7 days]`, `accessDuration ∈ [1 day, 365 days]`. `protocolTreasury` = factory deployer.

**Corpus.sol** — one instance per dataset; a minimal hand-rolled dividend-bearing ERC-20 (no OZ: no network dep, small audit surface, full control of correction math). **Bounties are cut entirely** (review: shipping untested money-adjacent functions while "cutting" the feature is the worst option).

| Function | Access | Behavior |
|---|---|---|
| `submit(bytes32 contentHash, string uri)` | anyone, `payable` | `msg.value == bondAmount`; `!contentSeen[hash]` else `DuplicateContent()`; `pendingOf[msg.sender] < 5` else `TooManyPending()` (flood/DoS cap); `!paused`. Stores `Pending`, `pendingOf++`, emits `SubmissionReceived`. |
| `postScore(uint id, uint16 score, string reason)` | onlyScorer | Pending-only; `score <= 1000` else `ScoreOutOfRange()`. **score == 0** → `Rejected`; `contentSeen[hash] = false` (frees squatted hashes); **100% of bond** → `_distributeToHolders(bond)` **excluding the rejected contributor** from that round (correction bump), or full refund credit if `totalSupply == 0`; emits `Slashed`. **score > 0** → `Scored`; **`_distributeToHolders(mintFee)` FIRST, then `_mint`** (ordering is load-bearing: the new minter must not share the fee it just paid); `credits[contributor] += bond - mintFee`; `mintFee = bond * 20 / 100`; mints `score * 1e15` shares (≤1.0 share/datum); emits `ScorePosted(id, score, reason)`. |
| `reclaimBond(uint id)` | contributor | Pending && `now > submittedAt + scoreTimeout` → `Expired`, `contentSeen[hash] = false`, 95% bond credited (5% to holders — mass-reclaim isn't free), `pendingOf--`. |
| `buyAccess()` | anyone, `payable` | `msg.value == accessPrice`; `scoredCount > 0` else `NoDataYet()` (no more "buy an empty corpus, curator keeps 90%"); `accessUntil[buyer] = max(now, current) + accessDuration` (**renewable 30-day access, not perpetual** — makes revenue a flow); split 10% protocol / 20% curator credits, remainder (incl. rounding dust) `_distributeToHolders`; emits `AccessPurchased`. |
| `claimDividends()` / `withdrawCredits()` | anyone | Pull-payments, CEI, zero-state-before-call, revert on zero. **Never pausable.** |
| `pause()` / `unpause()` | curator | `pause()` sets `pausedUntil = now + 24h` — **auto-expires** so a curator can't freeze the market forever. Blocks `submit`/`buyAccess` only. |
| Views | — | `submissionCount`, `getSubmissions(offset, limit)` (**clamps past-end, never reverts**), `withdrawableDividendOf`, `creditsOf`, `hasAccess(addr)` (= `accessUntil > now`), `scoredCount`. |

**ERC-20 rules:** `_transfer` requires `to != 0 && to != address(this)`; dividend corrections move so past dividends stay with the sender; self-transfer must be balance-safe (read-modify-write ordering test).

**Withdrawable formula (written out because this is where hand-rolled dividend tokens break):**
```
accumulative(a) = uint256( int256(magnifiedDividendPerShare * balanceOf[a]) + corrections[a] ) / MAG
withdrawable(a) = accumulative(a) - withdrawn[a]          // MAG = 2**128, divide ONCE, sum in signed magnified space
```

**Money invariants (each a dedicated test):**
1. Every `payable` path accounts for 100% of `msg.value`; splits sum exactly; remainder → holder pool.
2. `address(this).balance ≥ Σ credits + Σ withdrawable + Σ pending bonds` (fuzz the **call sequence**, not the amounts — bond/price are constructor-fixed; fuzzing amounts finds unreachable overflow).
3. No push transfers in user state-changing paths (pull-only) + reentrancy attacker test anyway.
4. A bond is released exactly once: score / slash / reclaim are mutually exclusive terminal states.

### 2.4 Scorer service (TypeScript, viem)

**Gate order (fail fast, every gate is a pure vitest-covered function):**
1. **Schema** — required fields from corpus config, non-empty → else `bad-schema`.
2. **Hash integrity** — `keccak256(blob) == contentHash` → else `hash-mismatch`.
3. **Coherence** — English-likeness (dictionary-hit ratio + entropy bounds) → else `low-coherence`. *(Kills gibberish-as-novelty.)*
4. **Relevance** — `cos(v, corpusCentroid)` (centroid seeded from the curator's schema/seed vector, updated with accepted records) `< 0.15` → `off-topic`. *(Kills the dominant strategy the review found: maximally-unrelated text scoring highest.)*
5. **Containment** — trigram *set* overlap `|T_new ∩ T_prior| / |T_prior| ≥ 0.80` vs any accepted record → `padded-copy`. *(Length-invariant; cosine alone is defeated by appending ~24% filler.)*
6. **Near-dupe** — `maxCosine ≥ 0.85` → `near-dup of #N (sim=…)`.
7. **Novelty score** — `clamp(round(1000 · (1−maxSim) · density · lengthFactor), 1, 1000)`, `density = 1/(1+0.35·|sim>0.72|)`, `lengthFactor = min(1, len/120)`.

Embedding: canonical text → char-3-gram → FNV-1a hashed into 512 dims → L2 normalize. Deterministic, offline, exact-value testable. **Embed semantic fields only** (`prompt_summary + expected_behavior + observed_behavior`; `category`/`model` excluded so shared vocabulary doesn't inflate similarity or let metadata churn fake novelty).

Runtime: `getLogs` cursor loop from the **deployment block** (700ms); serial nonce-managed `postScore` queue; state JSON that **self-resets when `chainHead < lastProcessedBlock` or the genesis hash changes** (the second-run killer). Shared **BigInt-safe serializer** for all JSON (bigint→string, ids→number) — used by `/state` and the dashboard hook.

API: `GET /state` (**metadata only** — no content bodies), `GET /manifest` (signature bound to **corpus address + chainId + timestamp**, rejected after 5 min; verifies `accessUntil[signer] > now` on-chain, then returns records + content key), `POST /events` (demo-only: reverted-submission feed so the dashboard can show BLOCKED).

**Documented limitation:** char-3-gram catches verbatim/padded/light-paraphrase; deep semantic rewriting can evade. Adapter interface allows API embeddings later.

### 2.5 Agents & demo (TypeScript)

- **Honest×2** — 10 seed records, staggered, sequential `await` sends (never `Promise.all`: duplicate nonces).
- **Copycat** — (a) verbatim resubmit → **on-chain revert**, POSTed to `/events`; (b) verbatim + 30% filler → `padded-copy`; (c) light paraphrase → `near-dup`.
- **Slopbot** — off-topic high-entropy record → `off-topic`/`low-coherence`.
- **Buyer** — `buyAccess()`, signs bound manifest request, fetches records + key, prints count.
- **demo.ts** — beats **await on-chain status with timeout** (never fixed sleeps); `--fast --assert` for e2e.
- **Corpus: "Model Red-Team Evals"** — `{model, category, prompt_summary, expected_behavior, observed_behavior, severity}`; benign, high-level descriptions of *public* failure classes, no operational attack strings. Narrative: *the failures ARE the dataset; labs are the buyers.*

### 2.6 Dashboard (Vite + React + viem, read-only)

Panels: header (corpus/chain/block/treasury); live feed (chips PENDING → NOVEL +score / SLASHED / BLOCKED, similarity bar, scorer reason) — **status derives from chain data**, scorer state is garnish so the "scorer down" mode genuinely works; leaderboard (shares, claimable, claimed, **net P&L** — attackers red); revenue (purchases + 70/20/10 viz + mint-fee inflow); provenance drawer (hash, contributor, timestamp, reason, tx link). Monad-purple dark theme, projector contrast, **system font stack — zero external requests** (wifi-off is a hard requirement, not a graceful-degradation hope). `vite --strictPort` so the URL in DEMO.md is always right.

### 2.7 Ops

`pnpm demo:reset` (built in phase 1, used as DEMO.md step 0 and mid-demo recovery): kill by port (8545/8787/5173) via process-group kill, wipe `data/store/` + scorer state, restart anvil, redeploy, restart scorer. Deploy addresses exported by **reading `factory.corpora(0)` over RPC** (never by parsing `broadcast/*.json` — factory-created addresses aren't named there).

---

## 3. Detailed Task Breakdown

**Build order is deliberately inverted from v1: seed data + threshold validation come before the scorer, and reset/ops come first.**

**1. Scaffold + ops (20 min)** — 1a pnpm workspaces + root scripts; 1b `forge init` (strip boilerplate); 1c strict tsconfig + vitest; 1d corpus config; **1e `demo:reset` + kill-by-port helper**; 1f throwaway deploy to validate the address-export path.

**2. Seed data + golden similarity gate (30 min)** — 2a author 10 honest records (varied phrasing) + 3 copycat variants + 1 slop record; 2b `contentStore.ts` (canonical JSON + convergent encryption) + round-trip vitest; 2c **golden vitest over the real seed files**: all honest pairwise sim < 0.80, paraphrase ≥ 0.88, padded copy containment ≥ 0.80, slop fails relevance/coherence, honest scores land in the banner range; iterate wording until green. *This gate protects the demo's core beat from silently inverting.*

**3. Contracts + tests (50 min)** — 3a `Corpus.sol`; 3b `CorpusFactory.sol` + validation; 3c unit + revert paths; 3d attack suite (reentrancy contract, non-scorer, double-score, score-after-reclaim, hash-squat-freed, pending cap, pause auto-expiry, `NoDataYet`, score>1000, transfer-to-self/zero/contract); 3e dividend suite + fuzz invariant (sequence-fuzzed); 3f `Deploy.s.sol` + address export.

**4. Scorer (35 min)** — 4a gates 1–7 as pure fns; 4b vitest incl. golden gate from task 2; 4c watcher + serial tx queue + self-resetting state; 4d `/state` `/manifest` `/events` + BigInt serializer.

**5. Agents + demo arc (25 min)** — 5a wallet/corpus helpers; 5b honest/copycat/slopbot/buyer; 5c `demo.ts` (await-status beats, narration, `--fast --assert`).

**6. Dashboard (40 min, parallel with 4–5)** — 6a chain-first hooks + scorer merge; 6b panels; 6c theme, empty/error states, no external fonts.

**7. E2E + browser gate (40 min — doubled from v1 per review)** — 7a `e2e.sh` (process-group teardown, port preflight, assertions); 7b **two consecutive full runs**, wifi off; 7c browser smoke + screenshots; 7d fix loop.

**8. Docs + cleanup + ship (20 min)** — DEMO.md, README, docs/codebase, cleanup sweep, gate re-run, progress + CHANGELOG, folder → `3_in_review`.

## 4. Acceptance Criteria

- [ ] `forge test` 100% pass, ≥ 30 tests incl. every attack case in 3d + sequence fuzz ≥ 256 runs
- [ ] `npx vitest run` green, ≥ 15 cases incl. the golden seed-similarity gate and contentStore round-trip
- [ ] `tsc --noEmit` clean
- [ ] `pnpm e2e` exit 0, asserting on a fresh chain: honest shares > 0 and dividends claimed > 0; copycat + slopbot hold 0 shares and net P&L < 0; verbatim submit reverted `DuplicateContent`; each attack recorded with its expected reason (`padded-copy`, `near-dup`, `off-topic`/`low-coherence`); buyer `hasAccess` true and manifest count == accepted count; protocol credit == 10% and curator == 20% of each purchase; mint fees flowed to holders; `balance ≥ Σ obligations` after all claims
- [ ] **`pnpm e2e` passes twice consecutively with no manual cleanup**
- [ ] Dashboard correct at empty / mid / post-demo, and with the scorer API down (chain data still renders)
- [ ] Demo arc < 3 min, wifi off, from DEMO.md alone; rehearsed twice end-to-end
- [ ] Testnet path scripted + documented (execution needs Ben's funded key — not blocking)
- [ ] No console errors, no secrets, anvil keys labeled dev-only, file sizes within standards

## 5. Risk Assessment

### 5.1 Economic / adversarial

| # | Attack | v1 status | **v2 defense** | Roadmap |
|---|---|---|---|---|
| 1 | Exact-dupe spam | ok | Hash registry, revert at door (freed on reject/expire so hashes can't be squatted) | — |
| 2 | Padded verbatim copy (**review CRITICAL — cosine defeated by ~24% filler**) | **broken** | Trigram-set **containment ≥ 0.80**, length-invariant | — |
| 3 | Off-topic max-novelty gaming (**review CRITICAL — was the dominant strategy**) | **broken** | **Relevance floor** (centroid cosine ≥ 0.15) + **coherence gate**; scoring band = novel ∩ on-topic ∩ coherent | Semantic embeddings |
| 4 | Free minting / unbounded dilution (**review HIGH**) | **broken** | **20% non-refundable mint fee to existing holders**; every mint compensates the diluted | Emission budget / vesting |
| 5 | Slash deterrent inverse to stake (whale spams cheaply) | **broken** | Rejected contributor **excluded from its own slash distribution** | — |
| 6 | Curator/scorer honeypot; zero-supply routing; infinite pause (**review HIGH**) | **broken** | `scorer != curator`; zero-supply reject → refund contributor; `buyAccess` requires `scoredCount > 0`; **pause auto-expires 24h** | Curator staking |
| 7 | Malicious scorer | mitigation was inadequate | Stated plainly as the v1 trust assumption; `reclaimBond` covers *absent* not *hostile*; 24h pause valve | Staked scorer set / optimistic scoring + challenge window / TEE |
| 8 | Scorer-flood DoS + reclaim-immunized junk | missing | `pendingOf < 5` cap; `scoreTimeout ∈ [5min,7d]`; reclaim refunds 95% | Rate-limit by reputation |
| 9 | Hash squatting / front-running authorship | partly | `contentSeen` freed on reject/expire; front-running stated as a real v1 gap with the commit-reveal design written out (binds `msg.sender`) | Commit-reveal |
| 10 | Perpetual access → one-shot "royalty" | **broken** | **30-day renewable access** → revenue is a recurring flow shares have a claim on | Metered per-query (x402) |
| 11 | Access buys nothing enforceable / replayable manifest token | missing | Content **encrypted at rest**, key released only to access holders; `/state` metadata-only; signature bound to corpus+chainId+timestamp, 5-min window | Encrypted delivery + key rotation |
| 12 | Semantic paraphrase evasion | ok (honest) | Not fully solved; bond + mint fee price each attempt | Semantic embeddings, challenge market |
| 13 | Sybil | answered wrong question | Real sybil vector is *many distinct records*, now priced by the mint fee and bounded by relevance/coherence | Reputation |
| 14 | Data poisoning | ok | Curator pause + provenance attribution; poisoning is on-chain attributable | Challenge market + jury |
| 15 | Wash-trading revenue optics | **claim was wrong (30%)** | Real leak is **10%** (curator cut is recoverable by the curator; own-factory wash is free) — corrected in the pitch; any future revenue-keyed incentive must count distinct funded buyers | Buyer analytics |
| 16 | Copyright / PII in contributions | out of scope | Unchanged: provenance assigns accountability to the contributor address | Curator ToS, takedown registry |

### 5.2 Delivery / demo

| Risk | Mitigation |
|---|---|
| **Second-run failure on stage** (review CRITICAL) | `demo:reset` step 0; scorer self-reset on chain reset; acceptance = two consecutive clean runs |
| **Thresholds mis-tuned → honest slashed or copycat minted** (review CRITICAL) | Seed data + golden vitest **before** the scorer; thresholds live in config |
| Address export finds no Corpus | Read `factory.corpora(0)` over RPC; validated in task 1f |
| BigInt JSON crash / type mismatch | One shared serializer, round-trip test |
| Orphaned processes, port drift | Process-group kill + port preflight + `--strictPort` |
| Venue wifi | Fully local: anvil, local CAS, local embeddings, system fonts, zero external requests |
| Scope blowout | Bounties cut; trim order: provenance drawer → revenue viz → second honest agent |
| Live-coding failure | Nothing typed on stage beyond 4 documented commands |

**Rollback:** every phase leaves a runnable system (contracts alone via `cast`; +scorer = scoring; +agents = headless loop; dashboard is additive).

## 6. Implementation Quality Standards (customized)

- **Files:** single responsibility; ~100-line target, >150 justified, >200 review blocker (exceptions: seed JSON, generated ABIs; `Corpus.sol` pre-justified to ~300 as the core money contract — split base/dividend mixin beyond that).
- **Tests:** every contract behavior incl. every revert; every scorer gate has exact-value cases; golden seed gate; e2e is the integration gate; tests beside code.
- **Contract safety:** pull-only, CEI, custom errors, events on every mutation, no unbounded state-changing loops, clamped paginated views, 100%-of-msg.value asserted, `score <= 1000`, transfer guards, dev-only key labeling, no secrets committed.
- **Ordering rule (comment it in code):** in `postScore`, distribute the mint fee **before** minting.
- **UI:** read-only, chain-first, poll-driven, loading/error/empty states, projector-legible, zero external requests.
- **Demo reliability:** wifi-off; deterministic seeds; reset script; no network dependency may block the arc.
