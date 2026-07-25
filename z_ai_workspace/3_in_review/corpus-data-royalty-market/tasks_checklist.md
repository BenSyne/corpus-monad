# Tasks Checklist v2 — corpus-data-royalty-market

**Synced to PRD v2 + implementation_plan v2.** Where an older doc conflicts, the PRD and plan v2 win.
Rules: no tool/method swaps without updating this file; tick a box only after the 3 self-checks pass.

## Pre-flight
- [x] Foundry 1.7.1, Node 22, pnpm 10 verified
- [x] git init + .gitignore
- [x] Adversarial review round 1 integrated (economics + technical)
- [x] Adversarial review round 2 integrated (fix-the-fixes + contradictions)
- [x] PRD HTML companion built

## 1. Scaffold + ops
- [x] 1a pnpm workspaces + root scripts
- [x] 1b forge init, boilerplate stripped
- [x] 1c strict tsconfig + vitest
- [x] 1d corpus config (domain lexicon, taxonomy, thresholds)
- [x] 1e reset.sh (kill-by-port + wipe + restart) — DEMO.md step 0
- [x] 1f throwaway deploy validating the factory.corpora(0) address-export path

## 2. Seed data + golden gate (FRONT-LOADED — protects the demo's core beat)
- [x] 2a 10 honest records + 4 attack records authored
- [x] 2b contentStore.ts (canonical JSON + convergent encryption)
- [x] 2c golden vitest over real seed files — 10/10 green, every honest record clears every gate with margin, all 4 attacks caught by their expected gate
- [x] Review task 2: empirically disproved centroid-cosine relevance; replaced with curator domain lexicon

## 3. Contracts + tests
- [x] 3a Corpus.sol (submit/postScore/reclaim/buyAccess/claims/pause + dividend ERC-20)
- [x] 3b CorpusFactory.sol + full parameter validation
- [x] 3c Corpus.t.sol unit + revert paths
- [x] 3d CorpusAttacks.t.sol (reentrancy, access control, pending cap, freed-hash theft, transfer guards)
- [x] 3e CorpusDividends.t.sol incl. all zero-supply fallbacks + sequence fuzz invariant
- [x] 3f Deploy.s.sol + deploy-local.sh address export
- [x] Review task 3: forge test summary logged in progress.md

## 4. Scorer service
- [x] 4a scoring gates (schema, coherence, relevance, containment, near-dupe, novelty)
- [x] 4b vitest for the scoring lib
- [x] 4c watcher (status-checked, accepted-set rebuild on boot, self-resetting state) + serial tx queue
- [x] 4d /state + /manifest + /events with BigInt-safe serialization
- [x] Review task 4: self-checks + vitest summary logged

## 5. Agents + demo arc
- [x] 5a wallet/corpus helpers
- [x] 5b honestA/honestB (<=4 in flight), copycat (3 attacks), slopbot (2 attacks), buyer
- [x] 5c demo.ts — await on-chain status per beat, narration, --fast --assert
- [x] Review task 5: headless arc output logged

## 6. Dashboard
- [x] 6a chain-first hooks + scorer-state merge (degrades when API is down)
- [x] 6b Header, Feed, Leaderboard, Revenue, ProvenanceDrawer
- [x] 6c theme, empty/error states, zero external requests (no CDN fonts)
- [x] Review task 6: renders at 0 and 50+ submissions

## 7. E2E + browser gate
- [x] 7a e2e.sh with all PRD 4 assertions
- [x] 7b passes TWICE consecutively, wifi off
- [x] 7c browser smoke of every panel + screenshots
- [x] Review task 7: e2e PASS output logged verbatim

## 8. Docs + ship
- [x] 8a DEMO.md (arc, testnet path, judge Q&A with v2 numbers, recovery)
- [x] 8b README + docs/codebase
- [x] 8c cleanup sweep (funds-flow re-review, dead code, stale comments)
- [x] 8d re-run every gate post-cleanup
- [x] 8e progress.md + CHANGELOG; move folder to 3_in_review

## Quantitative acceptance
- forge test: 100% pass, >=30 tests, fuzz >=512 runs
- vitest: 10 cases covering every gate against the real seed data (the golden gate is worth more than a raw count)
- e2e: exit 0 twice consecutively
- demo arc < 3 min; dashboard poll <= 1s; zero console errors

## CUT from scope (deliberate)
Bounties (contract fns, tests, UI panel, demo beat) — discretionary payouts with lockable pots were the weakest surface in the design; removed entirely rather than half-shipped.

## Final verification (2026-07-25)
- forge test: **55 passed, 0 failed** (incl. reentrancy attacks + 512-run solvency fuzz)
- vitest: **10 passed** — every gate exercised against the shipped seed records
- tsc --noEmit: **clean**
- pnpm e2e: **PASSED twice consecutively**, no cleanup between runs
- Browser: feed, leaderboard, revenue, provenance drawer, empty state, scorer-offline degraded mode — all verified, zero console errors on clean load

## Deviations from standard
- `Corpus.sol` is 412 lines against a pre-justified ~300. Not split: it is one cohesive money contract, and an inheritance seam would cut straight through the dividend-correction logic the fuzz suite covers. Refactoring verified money code hours before a live demo is the larger risk.
