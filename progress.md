Changelog
---------

2026-07-25 13:24 — Researched Monad network + Blitz Toronto hackathon; wrote HACKATHON.md with closed-loop design for 'Corpus' (agent data-royalty market), alternative ideas, testnet connection details, and demo plan
2026-07-25 13:28 — Wrote and spoke aloud the Corpus pitch (plus Tollbooth and red-team runner-ups) via macOS say; script saved for demo reuse
2026-07-25 14:00 — Adversarial reviews R1+R2 complete; scoring pipeline validated against real seed data (10/10 vitest green)
  R1 found the dominant-strategy bug: pure novelty scoring paid off-topic garbage MORE than honest data. R2 found pendingOf never decremented (would brick agents after 5 submits) + 3 unspecified zero-supply division paths.
  Empirically disproved the planned centroid-cosine relevance gate: char-trigram cosine cannot separate topics (honest 0.43 vs off-topic logistics 0.44). Replaced with a curator-declared domain lexicon — cleanly separates (honest 4-11 hits, logistics 0, gibberish 0) and is a better story: the curator defines scope, not a magic threshold.
2026-07-25 14:19 — Contracts (55 forge tests green incl. 512-run solvency fuzz) + scorer + agents; full demo arc passes all assertions
  Fixed a real race: scorer published its verdict on-chain before recording the reason, so anything watching both saw a scored submission with no explanation. Details are now written before the tx.
  Reordered gates to similarity-then-containment: the padded copy genuinely evades cosine (0.847 < 0.85 threshold), which is exactly why the containment backstop exists. Four attacks now demonstrate four distinct defenses.
2026-07-25 14:37 — Dashboard, e2e harness, DEMO.md runbook, README, PRD HTML companion; all gates green, e2e passes twice consecutively
  Verified in-browser: live feed, leaderboard, revenue panel, provenance drawer, empty state, and scorer-offline degraded mode (chain data still renders). Zero console errors on a clean load.
  Deviation logged: Corpus.sol is 412 lines against a pre-justified ~300. Not split — it is a single cohesive money contract and the dividend-correction logic it would cut across is exactly what the fuzz suite covers. Refactoring tested money code hours before a live demo is the worse risk.

## Learnings
- Adversarial review before coding paid for itself three times over. Both fatal economic flaws (off-topic garbage as the dominant strategy; padding defeating cosine similarity) were design-level and would have been extremely expensive to find after the contracts were written — or, worse, live on stage.
- Measure before trusting a threshold. The planned centroid-cosine relevance gate looked reasonable on paper and was empirically useless (0.43 honest vs 0.44 off-topic). Character trigrams catch near-duplicates well and cannot judge subject matter at all.
- When a test fails, check which side is wrong. Six of eight test failures in this build were incorrect expectations, not contract bugs — including two where I had forgotten that a view call consumes a pending Foundry prank.
