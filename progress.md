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
2026-07-25 14:52 — Added an MCP server so any outside agent can join the market; wired into e2e, both runs green
  Ben asked whether a real agent could connect. It could not — the demo's "agents" were scripted TypeScript calling the contract directly, with no external interface. Now there are 8 MCP tools (info, contribute, check, earnings, claim, buy access, read data, activity) and .mcp.json ships in the repo, so Claude Code picks it up automatically and Claude Desktop takes the same block.
  Verified over the wire with a real MCP client, not just as functions: connect, handshake, list tools, contribute to an established corpus (scored 256, minted 5.8% of the corpus), then get refused when resubmitting a duplicate.
2026-07-25 15:08 — Built a scroll-driven 3D landing page (Three.js) as the pitch; landing at /, dashboard moved to /app.html
  ~4200 GPU particles morph through six formations on scroll: chaos, corpus lattice, shield (attackers flung out red), proof grid, parallel corpora, warp. Bundled locally so wifi-off holds. Both entries typecheck + production-build clean.
  Note: CSS reveal transitions freeze in the automated Browser pane because it throttles rAF/the CSS clock on non-fronted tabs — a preview-tool artifact, not a bug. Fronting the tab confirmed it runs smoothly; it will be smooth on a real focused browser.
2026-07-25 15:18 — Made the landing visuals far more pronounced: added UnrealBloom postprocessing, scaled up all six formations, brighter/larger particles, and scroll-velocity energy
  Bloom glow now runs through every section instead of only the warp. Transition "churn" spikes particle turbulence, size, and bloom strength proportional to scroll speed, so each morph visibly bursts. Added a left text-scrim + heading glow-shadows so the bolder field never hurts legibility. Bundle 124kB gzip, still fully local (wifi-off safe). Typecheck + production build clean.
2026-07-25 15:33 — Remapped all six particle formations to literally represent the system, not abstract shapes
  0 scattered data (the problem) → 1 a torus = the contribute→score→mint→earn loop → 2 a crystalline data cube shielded from red attackers = the defended corpus → 3 linked blocks = the on-chain ledger (proof) → 4 parallel block-lanes = Monad's parallel execution → 5 hub-and-spoke = agents connecting over MCP. Each shape now maps to the section's copy. Typecheck + build clean.
2026-07-25 16:44 — Built an on-brand pitch deck (arrow-key slides, live particle field that morphs to each formation) and published it as an artifact
  9 slides: title, problem, the model, four-defenses, why-Monad, MCP, verified, honest-limitations, vision. Vanilla-canvas particle field (no libs, CSP-safe) morphs loop→scatter→corpus→parallel→network→chain to match each slide. Keyboard (arrows/space/home/end/1-9), on-screen arrows, touch swipe. Also served locally at /deck.html via web/public. Published: https://claude.ai/code/artifact/b9e03f15-37bb-4cf6-84b4-921b9ea56be1
  NETWORK STATUS: everything runs on local anvil (chain 31337). Nothing is deployed to Monad testnet (10143) or mainnet (143) yet — the testnet deploy path is scripted and documented but needs Ben's faucet-funded key.
