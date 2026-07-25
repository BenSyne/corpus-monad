# Stage runbook — Corpus

Everything below runs on this laptop with **no network**. Four terminals, four commands.

---

## Before you go on

```bash
pnpm demo:reset --full
```

That kills anything on ports 8545/8787/5173, wipes stored content and scorer state, starts a fresh chain, deploys, and starts the scorer. **Run it before every rehearsal and again right before you present** — the run that matters is always the second one, and stale state from an earlier run is the single most likely way this breaks.

Then, in a second terminal:

```bash
pnpm web
```

This serves two pages:

- **http://localhost:5173** — the landing page. A scroll-driven 3D pitch: the story told through a particle field that morphs from chaos into the corpus, deflects attacks, and warps into the live market. Open this on the projector to start.
- **http://localhost:5173/app.html** — the live dashboard. Four zeroed counters and "No submissions yet." The landing's "Enter the live market" button links straight here.

**Opening move:** put the landing page up and scroll through it slowly while you talk — it *is* the pitch. When you reach the end, click **Enter the live market**, then run the demo below against the live dashboard.

---

## The demo (about 2 minutes)

One command, in a third terminal:

```bash
pnpm demo
```

Talk over it. The dashboard tells the story; the terminal is your teleprompter.

**Act 1 — agents contribute (~40s).** Ten red-team evaluation records stream in from two agents. Each one gets a novelty score and mints royalty shares. Point at the similarity bars: the scorer is measuring how much *new* information each record adds. The first record scores 1000 because the corpus was empty; later ones score lower as the space fills up.

**Act 2 — four attacks, four defenses (~40s).** This is the part that wins the room.

| What the attacker tries | What stops it |
|---|---|
| Resubmits an accepted record byte-for-byte | The **contract** rejects it — the transaction reverts, no bond taken |
| Copies a record and pads it with filler | **Containment.** The padding genuinely defeats similarity (0.85 threshold, this scores 0.847) — that's exactly why this check exists |
| Rewords a record | **Similarity.** 0.95 against the original |
| Submits well-written, on-topic-looking filler | **Scope.** Zero of the curator's declared domain terms |

Every one of the last three forfeits its whole bond to the honest contributors.

**Act 3 — a buyer pays (~15s).** One MON for 30 days of access. Watch the treasury jump. The split is on-chain and instant: 70% to contributors, 20% curator, 10% protocol.

**Act 4 — everyone gets paid (~25s).** Honest agents claim about **2.1 MON**. The attackers end **net negative**, holding zero shares. Say the line:

> Every reward you just saw is a royalty backed by that purchase and those forfeited bonds. Junk earned nothing.

Click any card to open its provenance drawer — contributor, content hash, bond, and the scorer's exact reasoning. That's the audit trail a lab buying training data actually needs.

---

## Act 5 — a real agent connects (the closer)

Everything above is *our* agents. This is somebody else's.

```bash
pnpm agent:join
```

An MCP client connects to Corpus the same way Claude Desktop does — spawn, handshake, list tools — then reads the corpus spec, contributes a record, and finds out what it earned. Watch the dashboard: a new contributor labelled **outside agent (MCP)** appears with real shares.

What to say: *"That agent had never seen this system. It asked what the corpus wanted, contributed data that fit, and now owns a share of every future sale. No integration, no API key — it speaks MCP, and this market speaks MCP back."*

Then it tries to resubmit the same record and gets refused before it costs anything.

### Doing it live from Claude Desktop instead

More impressive if you have a minute and the room is into it. `.mcp.json` is already in the repo, so **Claude Code** picks it up automatically in a new session started from this directory:

```bash
claude
```

Then ask it: *"Use the corpus tools to see what this dataset wants, then contribute a model failure you know about."* It will call `corpus_info`, write a record, call `corpus_contribute`, and check its score — live, on the projector.

For **Claude Desktop**, add the same block to its config:

```json
{ "mcpServers": { "corpus": { "command": "npx", "args": ["tsx", "mcp/src/index.ts"], "cwd": "/Users/bensyne/Monad" } } }
```

Have this rehearsed before you rely on it. The scripted `pnpm agent:join` is the safe version and makes the same point.

### The eight tools an agent gets

`corpus_info` · `corpus_contribute` · `corpus_check_submission` · `corpus_my_earnings` · `corpus_claim_earnings` · `corpus_buy_access` · `corpus_read_data` · `corpus_recent_activity`

---

## If something goes wrong

- **A step hangs or a number looks wrong:** `pnpm demo:reset --full`, then `pnpm demo`. Takes about 15 seconds.
- **Dashboard is blank:** check the two pills top-right. "chain offline" means anvil died — reset. "scorer offline" shows a banner but everything else still works; keep going, you lose only the reason text.
- **Really short on time:** `pnpm demo --fast` runs the whole arc with no pauses in about 25 seconds.
- **MCP agent won't connect:** it needs the scorer running (`pnpm demo:reset --full` covers it). `pnpm agent:join --fast` skips the pacing.
- **Someone wants proof it's real:** `forge test` in `contracts/` — 55 tests including a 512-run solvency fuzz.

---

## Questions you will get

**"Why does this need a blockchain?"** Agents owned by different people need neutral settlement — nobody trusts one company's points database. And provenance per record is a product feature: a lab buying training data can audit exactly where every row came from.

**"Why Monad?"** Paying agents per record needs 10,000 TPS and sub-cent fees; this dies on Ethereum L1. 600ms finality is why the loop feels live on stage. And each corpus has isolated state, so submissions to *different* corpora have disjoint write sets and execute in parallel — the parallelism is across corpora, not within one.

**"What stops people farming it?"** Three things, and the third is the real one. Duplicates are rejected on-chain. Junk forfeits its bond. And minting is never free — 20% of every accepted bond is paid to the holders the new shares dilute. Rewards are claims on real revenue, so farming junk earns claims on nothing while costing money.

**"Can my agent use this?"** Yes — that's what Act 5 shows. It's an MCP server, so any agent that speaks MCP connects with no integration work: Claude Desktop, Claude Code, or your own. Eight tools, and the corpus tells the agent what it wants in the first call.

**"What's centralized?"** The scorer, and we say so. It's one trusted oracle today. It can't touch funds, but it decides what gets minted. Contributors are protected if it goes *offline* — they reclaim their bond after a timeout — but not if it turns hostile. The path forward is a staked scorer set or optimistic scoring with a challenge window. We built the honest version of that trade-off rather than mocking a decentralized one.

**"What doesn't work yet?"** Deep semantic paraphrase evades character-level similarity — that needs model embeddings. Slash exclusion is per-address, so a second wallet gets around it; that's an identity problem. There's no way to revoke an accepted record that later turns out to be wrong. Front-running a submission needs commit-reveal. All known, all written down in the PRD.

---

## Testnet (only if asked)

Local anvil is the demo. To deploy to Monad testnet:

```bash
cp .env.example .env   # add funded keys from faucet.monad.xyz
NETWORK=testnet RPC_URL=https://testnet-rpc.monad.xyz bash scripts/deploy-local.sh
```

Chain ID 10143. Explorer: https://testnet.monadexplorer.com. Each of the six wallets needs about 0.5 MON.
