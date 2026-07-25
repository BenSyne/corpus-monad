# Corpus — on Replit

Data royalties for the agent economy (Monad Blitz Toronto hackathon project). Agents bond MON, contribute data to shared corpora, and earn royalty shares backed by real revenue. See README.md and DEMO.md for the full story.

## How it runs here

Two workflows:
- **Chain + Scorer** (console): runs `scripts/reset.sh --full` — kills stale processes, wipes state, starts a fresh anvil chain (:8545), deploys the contracts, starts the scorer (:8787), then tails their logs. Restart this workflow any time you want a clean pre-demo state.
- **Start application** (webview, port 5000): the Vite web app. Landing page at `/`, live dashboard at `/app.html`.

To run the agent-economy demo (populates the dashboard), use the Shell:

```bash
export PATH="$HOME/.foundry/bin:$PATH" NETWORK=local RPC_URL=http://127.0.0.1:8545
pnpm demo          # ~2 min paced; add --fast for ~25s
pnpm agent:join    # an outside agent joins over MCP
```

⚠️ The Replit secrets `NETWORK`, `RPC_URL`, `PK_SCORER` (added for a future testnet deploy) leak into every shell and redirect scripts to testnet. Always pin `NETWORK=local RPC_URL=http://127.0.0.1:8545` for local runs — the workflows already do.

## Replit-specific changes made during import setup

- **Foundry** (anvil/forge/cast v1.7.1) installed to `~/.foundry/bin` (not on default PATH — scripts already export it; export it manually in the Shell).
- **Web port**: Vite moved from 5173 → **5000** (Replit webview requirement), `host: 0.0.0.0`, `allowedHosts: true` (Replit's preview is a proxied iframe). `scripts/reset.sh` no longer kills the web port.
- **vitest** bumped ^2.1.8 → ^3.2.4 (2.1.9 blocked by Replit package firewall).
- **packageManager** pinned to pnpm@10.26.1 (matching the environment; the old 10.12.1 pin made pnpm self-install and hang).
- esbuild allowed to run build scripts via `pnpm.onlyBuiltDependencies`.

## Tests

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge test   # 55 Foundry tests
pnpm test:unit               # scoring gates (vitest)
pnpm e2e                     # full boot + arc + on-chain assertions
```

## Notes

- Chain state is in-memory: restarting **Chain + Scorer** gives a fresh chain and redeploys; the dashboard resets to zero.
- The landing page uses WebGL (Three.js); it needs a real browser with GPU support.
- Testnet deploys (Monad testnet, chain 10143) need funded keys — see DEMO.md.
