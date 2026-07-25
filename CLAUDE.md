# CLAUDE.md — Corpus (Monad Blitz Toronto)

**Project:** Corpus — provenance-backed data royalties for the agent economy, on Monad.
**Context:** Built for Monad Blitz Toronto (July 25, 2026, lu.ma/MonadBlitzTO). Demo-on-stage is the #1 deliverable: everything must run offline on this Mac (local anvil), with a testnet deploy path ready. See `HACKATHON.md` for the pitch and `z_ai_workspace/` for active work.

## Core Working Principles

1. **Think before coding.** Before any non-trivial change, state your assumptions; when the request is ambiguous, lay out the two likely interpretations and ask rather than guess. Feature-sized work also has the PRD approval gate.
2. **Simplicity first.** Write only what the task needs — no speculative features, config, or abstraction. Gut-check: would a senior engineer call this overcomplicated? If yes, cut it.
3. **Surgical changes.** Touch only what the task requires. Don't refactor working code or reformat lines you didn't change; flag unrelated dead code rather than deleting it — except during the explicit step-8 cleanup sweep.
4. **Goal-driven execution.** Turn "make it work" into a verifiable success criterion *before* you code, then loop until it passes.

## Stack & Commands

- **Contracts:** Solidity + Foundry (`contracts/`). `forge build`, `forge test`, deploy via `forge script`.
- **Services & agents:** TypeScript + Node 22 + viem, pnpm workspaces (`scorer/`, `agents/`, `shared/`).
- **Dashboard:** Vite + React + viem, read-only (no wallet connect needed) (`web/`).
- **Local chain:** anvil (`pnpm chain`). **Testnet:** Monad testnet, chain ID 10143, `https://testnet-rpc.monad.xyz`, explorer `https://testnet.monadexplorer.com`.
- **Payments:** native MON only. No external DB — scorer state is a local JSON store; content store is local content-addressed files (`data/store/`), IPFS is roadmap.

```bash
pnpm chain          # anvil local chain
pnpm deploy:local   # deploy factory + demo corpus, write shared/deployments/local.json
pnpm scorer         # start scorer service (chain watcher + scoring + state API)
pnpm web            # dashboard dev server
pnpm demo           # run the staged demo arc (agents submit/attack/buy)
pnpm e2e            # headless: anvil + deploy + scorer + demo --fast + assertions
forge test          # contract unit/fuzz tests (run in contracts/)
```

## AI Workspace Management System

### When this protocol applies

Required for any request that needs a plan or PRD: **features**, significant **edits**, **upgrades**, **fixes**.

### Folder structure

```
z_ai_workspace/
├── 1_backlog/       # Future tasks
├── 2_doing/         # Active projects
├── 3_in_review/     # Awaiting Ben's review
└── 4_done/          # Approved
```

**Flow:** new request → `2_doing` (start now) or `1_backlog` → `3_in_review` → `4_done`. State transitions = folder moves + a `progress.md` entry. (No external PM board for this project.)

### Per-project structure

```
z_ai_workspace/<status>/<project-name>/
├── PRD_<project-name>.md      # Requirements (markdown)
├── PRD_<project-name>.html    # Visual companion (MANDATORY)
├── implementation_plan.md     # Technical plan
├── tasks_checklist.md         # Numbered task breakdown — single source of truth for scope
└── notes_and_research.md      # Research & decisions (incl. adversarial review findings)
```

### HTML companion (MANDATORY)

Every PRD ships **both** markdown **and** a visually rich HTML companion. Markdown is for the agent to ingest; HTML is what humans actually read.

**Quality bar — Linear / Vercel / Stripe Press:** dark theme, generous spacing, Inter (body) + JetBrains Mono (code), inline CSS only (self-contained), custom Mermaid theme matching the palette (never default; load `https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js`), TL;DR near top → progressively deeper, right viz per content type, mobile-responsive, restraint over decoration. Required content: hero (title + status/date/target); TL;DR 3-card (Problem/Fix/Impact); Mermaid diagrams (flows, architecture, money flow); in/out-of-scope cards; phased roadmap with estimates; risks as cards; open questions; approval gate. At hand-back: `open <absolute-path>`.

### PRD structure

1. **Executive Summary** — problem, solution, success criteria
2. **Technical Implementation Plan** — architecture, stack, contract interfaces, mechanism design
3. **Detailed Task Breakdown** — numbered tasks (1, 2, 3), lettered subtasks (1a, 1b), time estimates, dependencies
4. **Acceptance Criteria** — testable requirements, definition of done, QA checklist
5. **Risk Assessment** — blockers, mitigations, rollback plans; **for anything touching funds: explicit attack/abuse analysis**
6. **Implementation Quality Standards** — customized per PRD from the standards below

**Completeness test:** "If I gave this PRD to another developer and disappeared forever, could they finish the project?" Cover What / Why / How / When / Who / Where.

### Implementation Quality Standards (NON-NEGOTIABLE)

- **File org + size** — single responsibility per file; ~100 lines target; >150 needs justification; >200 is a review blocker (exceptions: generated artifacts, ABIs, fixtures, seed data). No "V2"/sibling files; no leftover debug scaffolding.
- **Testing** — every contract behavior gets a Foundry test (happy path + revert path + at least one attack test where funds move); every scorer/agent pure function gets a vitest test; `pnpm e2e` green before claiming done; `tsc --noEmit` clean.
- **Contract safety (this project's equivalent of the migrations rule — strictly enforced)** — pull-payments only (no push transfers to arbitrary addresses); checks-effects-interactions everywhere; no unbounded loops over user-controlled arrays in state-changing paths; paginated view functions; custom errors; events for every state change the UI needs; every `payable` path accounts for 100% of msg.value (assert in tests); solidity ^0.8 checked math; no `tx.origin`; scorer trust assumption documented in-code where it applies.
- **UI patterns** — dashboard is read-only + poll-driven; loading/error/empty states for every panel; must render correctly with zero submissions (pre-demo state) and 50+ (post-demo).
- **No workarounds** — tool/permission/dep blocker → escalate to Ben. Don't mock what should be real, don't swap a prescribed tool.
- **Naming + clarity** — names describe intent at a glance; comments explain *why* not *what*; no comments referencing the current task/PR.
- **Demo reliability (hackathon-specific)** — the full demo arc must run with wifi off (local anvil + local content store + local embeddings); deterministic seed data checked into `data/seed/`; any network dependency (testnet RPC, CDN font) must degrade gracefully, never block the demo.

### Project naming

Kebab-case, descriptive. Good: `corpus-data-royalty-market`. Bad: `task1`, `fix`.

## Working Rhythm, Roles & Time Estimation

**Ben:** ideates, scopes, approves PRDs (no code until approved — Ben may pre-approve verbally for goal-mode runs, recorded in the PRD approval gate), final QA + revision rounds, runs the stage demo.
**Claude:** researches; writes docs; implements + tests + iterates till green; ships; logs progress.

**Estimation rule:** Claude implements — take the human estimate, multiply by **0.01–0.10**, round to 5–10 min. "2-day feature" → 20 min–2 hr. Real hours go to human-paced parts: approvals, revision rounds, stage rehearsal.

### Build-and-revise loop

1. Ideate + scope (Ben)
2. PRD — Claude drafts all workspace docs
3. Approval gate — Ben approves/amends; **no code until this happens** (verbal pre-approval counts, record it)
4. Build — work numbered tasks in `tasks_checklist.md` order, tests alongside
5. First test pass — forge test + vitest + e2e + dashboard browser check; fix everything before handing back
6. Summary to Ben — what changed, files, how to verify, caveats
7. Revision round(s) — expect 1–3
8. Stress + cleanup sweep (the one designated cleanup window) — funds-flow attacks (reentrancy, griefing, rounding theft, access control), functional gaps (edges, error/empty states), dead code, dupes, stale comments
9. Documentation — README, DEMO.md runbook, `docs/codebase/` updates
10. Final verification — re-run all gates, confirm no regressions from cleanup
11. Ship — move workspace folder, final `progress.md` + `docs/CHANGELOG.md` entries

**Never ship with known failures. Never mark done while issues are open.**

### When estimates blow up

A "30 min" task running an hour → **stop, surface the blocker** in progress.md and to Ben. Typical causes: bug in existing code, undocumented env dependency, tool/permission issue, design decision needing Ben. Large overruns almost always mean the plan is wrong, not that Claude needs to try harder.

## Testing Gate (MANDATORY before leaving `2_doing`)

1. **Contract tests:** `forge test` — 100% pass, including revert-path and attack tests. Fuzz the dividend/accounting invariants (sum of claimable ≤ contract balance).
2. **Service tests:** `npx vitest run` for scorer scoring lib (dedup thresholds, novelty scoring, schema validation) — deterministic local embeddings make these exact.
3. **E2E:** `pnpm e2e` — boots anvil, deploys, runs scorer + full demo arc headless, asserts final on-chain state (honest agent earned shares + dividends; copycat slashed and net-negative; buyer has access; accounting adds to 100%).
4. **Dashboard smoke (in-app Browser tools):** load the dashboard against a live demo run; verify every panel renders (feed, leaderboard, treasury, provenance drawer), no console errors; screenshot key states.
5. Results logged in `progress.md`. If anything is broken: fix, re-run. Never move forward with known failures.

## Progress Logging

Maintain **one** `progress.md` at repo root (already started). Format:

```
YYYY-MM-DD HH:MM — Commit-style one-liner
  Optional indented block: gotchas, decisions, anything a dev restarting needs.
```

Timestamps: America/Toronto, fetched via curl (worldtimeapi) with `TZ='America/New_York' date '+%Y-%m-%d %H:%M'` as fallback — never guess the time. Append after every completed subtask. Cross-cutting lessons go at the bottom under `## Learnings`. Also keep `docs/CHANGELOG.md` session entries per the global agent standards (session objective, files modified, decisions, system state, next steps).

## Communication Rules

- Reply in diff-friendly Markdown. Plain English, minimize jargon.
- Don't sound confident unless you revised it 3x. Don't say "You are right!" — help with the work, not flattery.
- Never edit code when the question doesn't ask for an edit/fix.
- Never work around tools or requirements: if something fails or is too slow, stop and ask.
- Prefer one-off `cast`/`curl` checks over writing throwaway test files; delete any scaffolding you create once it's served its purpose.
