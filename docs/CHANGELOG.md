# Development Changelog

## 2026-07-25 - Agent: claude (Fable 5)

### 🎯 Session Objective
Design, adversarially review, build, and verify "Corpus" — an on-chain data-royalty market for the agent economy — ready to demo live at Monad Blitz Toronto.

### ✅ Completed This Session
- [x] Researched Monad + Blitz Toronto; wrote the pitch → **DONE** ✅
- [x] Project-specific CLAUDE.md adapted from the AdCreativeCrafter reference → **DONE** ✅
- [x] PRD + implementation plan + tasks checklist + research notes → **DONE** ✅
- [x] Two adversarial review rounds (economics, technical, then fix-the-fixes) → **DONE** ✅
- [x] Contracts + 55 Foundry tests incl. reentrancy and solvency fuzz → **DONE** ✅
- [x] Scorer service with seven gates, validated against real seed data → **DONE** ✅
- [x] Agents, four-attack demo arc, e2e harness → **DONE** ✅
- [x] Live dashboard + browser verification incl. degraded mode → **DONE** ✅
- [x] DEMO.md runbook, README, PRD HTML companion → **DONE** ✅

### 📄 Files Modified
- `contracts/src/{Corpus,CorpusFactory}.sol` + `contracts/test/*` (55 tests)
- `scorer/src/**` — watcher, seven scoring gates, state API
- `agents/src/**` — contributors, attackers, buyer, demo orchestrator
- `web/src/**` — read-only dashboard
- `shared/src/**` — content store, config, ABIs, canonical serialization
- `scripts/{deploy-local,reset,e2e}.sh`, `data/seed/**`
- `DEMO.md`, `README.md`, `CLAUDE.md`, `progress.md`
- `z_ai_workspace/2_doing/corpus-data-royalty-market/*` (PRD md + html, plan, checklist, notes)

### 🔧 Technical Decisions Made
- **Decision**: Rewards are per-corpus dividend-bearing ERC-20 royalty shares, with a 20% non-refundable mint fee paid to existing holders. **Rationale**: makes "claims on revenue, not points" literally true and gives minting a marginal cost that scales with volume. **Impact**: dividend-correction complexity, covered by a dedicated suite and a 512-run solvency fuzz.
- **Decision**: Topical relevance uses a curator-declared domain lexicon, not centroid cosine. **Rationale**: measured — trigram cosine cannot separate topics (0.43 honest vs 0.44 off-topic). **Impact**: better story too; the curator defines scope rather than a magic threshold.
- **Decision**: Gates run similarity before containment. **Rationale**: the padded attack genuinely evades cosine at 0.847, which is exactly the case containment exists to catch; this ordering makes the two attacks demonstrate two distinct defenses.
- **Decision**: Bounties cut entirely rather than half-shipped.

### 🧩 Current System State
- **Contracts**: 55/55 tests ✅ · **Scorer**: 10/10 vitest ✅ · **Typecheck**: clean ✅
- **E2E**: passes twice consecutively with no cleanup between ✅
- **Dashboard**: verified in-browser incl. empty state and scorer-offline mode ✅
- **Testnet deploy**: scripted and documented, needs Ben's funded key ⏳

### 🚧 Active Blockers
None.

### 📍 Current Position & Next Steps
**Where we are**: Feature-complete and verified; ready to demo.
**Next logical step**: Ben runs `pnpm demo:reset --full`, rehearses once from DEMO.md, then presents.
**Priority**: Rehearse before going on stage.

### 🔄 Handoff Notes
`DEMO.md` is the stage runbook — four commands, a two-minute arc, prepared answers for the questions judges actually ask. Run `pnpm demo:reset --full` before every run; stale state between runs is the one failure mode that would look like a product bug. Known limitations are listed in README and DEMO.md deliberately: stating them is stronger than being caught by them.
