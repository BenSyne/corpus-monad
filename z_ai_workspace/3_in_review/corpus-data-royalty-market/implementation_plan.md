# Implementation Plan v2 — corpus-data-royalty-market

**This file supersedes v1 entirely.** It is the build-from spec, synced to PRD v2 + adversarial rounds 1 and 2. Where anything conflicts with an older doc, this file and the PRD win.

## Locked parameters

| Param | Value | Why |
|---|---|---|
| `bondAmount` | 0.1 MON | submission stake |
| `mintFee` | 20% of bond (0.02) | **non-refundable on accept**, paid to existing holders — makes minting cost-positive and compensates dilution |
| slash on reject | **100% of bond** to holders (rejectee excluded) | halving the penalty bought nothing |
| `reclaimBond` | 95% refund, 5% to holders | mass-reclaim isn't free |
| `accessPrice` | 1 MON | 30-day access |
| `accessDuration` | 30 days, renewable (`max(now, current) + duration`) | revenue is a flow, not a one-shot |
| split | 10% protocol / 20% curator / 70% holders | remainder dust → holders |
| `scoreTimeout` | 15 min (bounds: 5 min – 7 days) | scorer-outage protection |
| pending cap | 5 per address | flood/DoS |
| near-dupe cosine | **0.85** (not 0.90) | 0.90 lets the paraphrase mint |
| containment | 0.80 | length-invariant anti-padding |
| `minDomainHits` | 2 | curator-declared scope |

## Contracts

### CorpusFactory.sol (~70 lines)
`createCorpus(name, symbol, schemaURI, scorer, curator, bondAmount, accessPrice, scoreTimeout, accessDuration)` → address; `corpora` array + `corporaCount()`; `CorpusCreated` event.
Validation: `scorer != curator` (kills the honeypot), both non-zero, `0 < bondAmount <= type(uint96).max`, `accessPrice > 0`, `scoreTimeout ∈ [5 min, 7 days]`, `accessDuration ∈ [1 day, 365 days]`. `protocolTreasury = msg.sender`.

### Corpus.sol (~300 lines, pre-justified as the core money contract)

```solidity
enum Status { Pending, Scored, Rejected, Expired }
struct Submission {
  address contributor; bytes32 contentHash; string uri;
  uint96 bond; uint40 submittedAt; uint16 score; Status status;
}
Submission[] submissions;
mapping(bytes32 => bool)    contentSeen;
mapping(bytes32 => address) contentOwner;   // R2#5: freed hashes are re-submittable only by the original author
mapping(address => uint32)  pendingOf;      // R2#1: MUST decrement in every terminal transition
uint256 scoredCount;                        // R2#1: increment on accept; gates buyAccess
mapping(address => uint256) credits;
mapping(address => uint40)  accessUntil;
uint40 pausedUntil;
// dividend ERC-20
uint256 magnifiedDividendPerShare; // MAG = 2**128
mapping(address => int256)  magnifiedCorrections;
mapping(address => uint256) withdrawnDividends;
```

**`_distributeToHolders(uint256 amount, address excluded)` — the fallback table (R2#2, R2#3):**
```
effectiveSupply = totalSupply - balanceOf(excluded)        // excluded may be address(0)
if (effectiveSupply == 0) → caller-specified fallback, never a division:
    mint-fee site   → waive: credit the full amount back to the contributor (nobody was diluted)
    reject-slash    → refund the contributor (no holders to pay)
    reclaim 5% cut  → refund the contributor (100% back)
    buyAccess       → unreachable (scoredCount > 0 ⇒ totalSupply > 0; min score is 1, no burn)
else:
    magnifiedDividendPerShare += amount * MAG / effectiveSupply
    if (excluded != 0) magnifiedCorrections[excluded] -= int256(deltaPerShare * balanceOf(excluded))
```
Excluding by *address* is bypassable with a second wallet — stated as a limitation, not claimed as solved.

**Flows (CEI everywhere, custom errors, event per mutation):**
- `submit(hash, uri)` payable: `msg.value == bondAmount`; `!paused`; `!contentSeen[hash]` → `DuplicateContent`; if `contentOwner[hash] != 0 && != msg.sender` → `NotContentOwner`; `pendingOf[msg.sender] < 5` → `TooManyPending`. Sets seen/owner, `pendingOf++`, pushes, emits `SubmissionReceived`.
- `postScore(id, score, reason)` onlyScorer, Pending-only, `score <= 1000` → `ScoreOutOfRange`. **Both branches: `pendingOf[contributor]--`.**
  - `score == 0` → Rejected; `contentSeen = false`; `_distributeToHolders(bond, contributor)`; emit `Slashed`.
  - `score > 0` → Scored; `scoredCount++`; **`_distributeToHolders(mintFee, address(0))` FIRST, then `_mint(contributor, score * 1e15)`** (ordering is load-bearing — the minter must not share the fee it just paid); `credits[contributor] += bond - mintFee`; emit `ScorePosted`.
- `reclaimBond(id)`: contributor-only, Pending, `now > submittedAt + scoreTimeout` → Expired; `contentSeen = false`; `pendingOf--`; `credits += 95%`; `_distributeToHolders(5%, address(0))`.
- `buyAccess()` payable: exact price; `scoredCount > 0` → else `NoDataYet`; `!paused`; `accessUntil[buyer] = max(now, accessUntil) + accessDuration`; credits 10%/20%; remainder to holders; emit `AccessPurchased`.
- `claimDividends()` / `withdrawCredits()`: pull, CEI, zero-before-call, revert on zero, **never pausable**.
- `pause()` curator: `now > pausedUntil + 24 hours` → else `PauseCooldown`; `pausedUntil = now + 24 hours`. `unpause()` sets it to 0.
- Views: `submissionCount`, `getSubmissions(offset, limit)` **clamped, never reverts**, `withdrawableDividendOf`, `creditsOf`, `hasAccess`, `scoredCount`.

**Withdrawable (divide exactly once, sum in signed magnified space):**
```
accumulative(a) = uint256( int256(magnifiedDividendPerShare * balanceOf[a]) + magnifiedCorrections[a] ) / MAG
withdrawable(a) = accumulative(a) - withdrawnDividends[a]
```
`_transfer`: `to != 0 && to != address(this)`; read-modify-write balances safely (self-transfer must not inflate); move corrections so past dividends stay with the sender. `_mint`: `magnifiedCorrections[to] -= int256(magnifiedDividendPerShare * shares)`.

### Test matrix (forge, ≥30 tests)
- **Corpus.t:** submit happy/wrong-bond/dupe-revert/pending-cap/paused; score mints exactly `score*1e15`; mint fee to holders before mint; credit = bond − fee; reject slashes 100% excluding rejectee; reclaim before/after timeout; buy splits exactly 10/20/70; renewal extends; `NoDataYet`; pause auto-expiry + cooldown; `getSubmissions` clamps.
- **CorpusAttacks.t:** non-scorer; double-score; score-after-reclaim; reclaim-after-score; reentrancy attacker on both claim paths; `score > 1000`; freed hash resubmitted by a stranger (`NotContentOwner`); pending cap frees after scoring; transfer to self/zero/contract.
- **CorpusDividends.t:** late minter gets nothing from earlier revenue; transfer keeps past dividends with sender; multi-buy accumulation; **zero-supply: first-accept mint fee waived, reclaim refunds 100%, reject refunds contributor**; rejectee-holds-all → fallback not division; **fuzz the call sequence** (not amounts): `balance ≥ Σcredits + Σwithdrawable + Σpending bonds`.

## Scorer (built + validated)

Gate order — **fail fast, all pure, all vitest-covered**: schema → hash integrity (missing blob retried 3 polls, then `missing-blob`) → length → coherence (English-likeness) → **domain scope** (curator lexicon, ≥2 hits) → containment (≥0.80) → near-dupe (≥0.85) → novelty score.

`score = clamp(round(1000 · (1−maxSim) · density · lengthFactor · relevanceFactor), 1, 1000)`
`density = 1/(1+0.35·neighbors>0.72)`, `lengthFactor = min(1, len/120)`, `relevanceFactor = clamp(hits/(2·3), 0.1, 1)` — relevance **scales** the payout, so barely-in-scope filler mints dust.

**Empirically validated (this is why the design changed):** char-trigram cosine cannot separate topic — honest records score 0.43 against a topic-seed vector and an off-topic logistics record scores 0.44. The curator's declared domain lexicon separates cleanly: honest 4–11 hits, off-topic 0, gibberish 0. Embedding uses semantic fields only (`prompt_summary + expected_behavior + observed_behavior`; `category`/`model` excluded).

Runtime: `getLogs` cursor from deploy block; **skips submissions whose on-chain status is no longer Pending** and **rebuilds the accepted set from chain + CAS on boot** (R2#9: plain restart must not double-score); state self-resets when `chainHead < lastProcessedBlock`; serial nonce queue; BigInt-safe serializer on every JSON boundary.
API: `/state` (metadata only), `/manifest` (signature bound to corpus+chainId+timestamp, 5-min window, `accessUntil > now`, returns records + content key), `/events` (demo revert feed for the BLOCKED chip).

## Agents

honestA/honestB (5 records each, **≤4 in flight**, sequential awaits — never `Promise.all`), copycat (verbatim → revert; padded → containment; paraphrase → similarity), slopbot (off-topic → scope; gibberish → coherence), buyer. `demo.ts` awaits on-chain status per beat (no fixed sleeps) with `--fast --assert`.

Anvil roles: 0 deployer/protocol, 1 scorer, 2 honestA, 3 honestB, 4 copycat, 5 slopbot, 6 buyer, 7 curator.

**Expected v2 arc:** 10 accepts (avg score ≈ 400–700) → copycat 1 revert + 2 slashes (−0.2 MON) → slopbot 2 slashes (−0.2 MON) → 1 purchase (1 MON: 0.1 protocol, 0.2 curator, 0.7 holders) → holders also collect 4 slashed bonds (0.4) + 10 mint fees (0.2). Do **not** assert v1's stale numbers.

## Ops

`scripts/reset.sh` (kill by port 8545/8787/5173 via process group, wipe `data/store` + scorer state, restart anvil, redeploy, restart scorer) — DEMO.md step 0 and mid-demo recovery.
`scripts/deploy-local.sh` → forge script, then read the corpus address from **`factory.corpora(0)` over RPC** (never from `broadcast/*.json` — factory-created addresses aren't named there) → `shared/deployments/local.json`.
`scripts/e2e.sh` — port preflight, process-group teardown trap, anvil → deploy → scorer → `demo --fast --assert` → PASS/FAIL summary. **Must pass twice consecutively.**

## Known limitations (say these before a judge does)
Hostile scorer (incl. scorer self-submitting) is a v1 trust assumption; address-based slash exclusion is wallet-bypassable; no revocation of an accepted-then-bad record; contributors hold the content key, so encryption gates non-participants only; deep semantic paraphrase evades trigram similarity; authorship front-running needs commit-reveal; parallel execution applies *across* corpora, not within one; wash-trading leaks 10% (not 30%) and 0% via a self-deployed factory.
