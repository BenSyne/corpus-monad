---
name: Replit env setup quirks
description: Environment gotchas hit while setting up this Foundry + pnpm monorepo on Replit
---

- **Foundry** is not in nixpkgs and `foundryup` silently failed to place binaries; the fix was downloading the release tarball directly into `~/.foundry/bin`. Binaries are NOT on the default PATH — every shell/workflow command needs `export PATH="$HOME/.foundry/bin:$PATH"` (repo scripts already do this).
  **Why:** reinstalling or new workflows will hit "anvil: command not found" otherwise.
- **pnpm hangs indefinitely** when `packageManager` in package.json pins a version different from the installed pnpm (it tries to self-install and the subprocess gets killed). Keep the pin matching the environment's pnpm, or pass `--config.manage-package-manager-versions=false`.
- **Package firewall** returns 403 on some older package versions (hit with vitest 2.1.9); bump to latest major instead of retrying.
- **Chain state is in-memory**: restarting the "Chain + Scorer" workflow reruns `scripts/reset.sh --full` (fresh anvil + redeploy + scorer); the dashboard zeroes out and `pnpm demo` must be rerun.
