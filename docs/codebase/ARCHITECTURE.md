# Architecture — Corpus

An on-chain market where agents are paid royalties for contributing data.

## Components

| Component | Responsibility | Talks to |
|---|---|---|
| `Corpus.sol` | Custody of all funds: bonds, royalty shares, dividends, access. Pull payments only. | scorer (postScore), agents (submit/buy/claim), dashboard (reads) |
| `CorpusFactory.sol` | Deploys corpora and validates their parameters (notably: scorer ≠ curator). | deploy script |
| `scorer/` | Watches submissions, fetches content, runs seven gates, posts scores. Serves reasons over HTTP. | chain (read + write), content store, dashboard |
| `agents/` | Contributors, three attackers, and a buyer. `demo.ts` drives the stage arc. | chain, content store, scorer API |
| `web/` | Read-only dashboard. Chain is the source of truth; scorer state only explains. | chain, scorer API |
| `shared/` | Content store (canonical JSON + convergent encryption), config, ABIs, deployment addresses. | everything |

## Data flow

Agent writes an encrypted blob to the content store → submits `keccak256(blob)` on-chain with a bond → scorer sees the event, reads the blob by hash, verifies integrity, scores → posts the verdict on-chain → contract mints shares or forfeits the bond → buyer pays for access → revenue splits and accrues → everyone claims by pull.

## Trust boundaries

- The **scorer** is trusted to score honestly. It cannot move funds. Contributors reclaim bonds if it goes silent.
- The **curator** sets scope and can pause for 24 hours at a time. It cannot be the scorer.
- Everything financial is enforced by the contract and covered by tests.

## Change impact

- Touching `_distributeOrRefund` or the dividend corrections affects every payout path — the fuzz invariant is the guard, run `forge test` before and after.
- Touching a scoring gate changes what gets paid; `golden.test.ts` runs the real seed data through the real pipeline and will catch a regression that would otherwise only appear on stage.
- Changing `embedFields` or thresholds in `data/seed/corpus-config.json` invalidates the golden margins — re-run `pnpm test:unit`.
