import { useState } from "react";
import deployment from "@deployment";
import { useCorpusState, mon, shortAddress, ROLE_NAMES, type Submission } from "./useCorpusState.js";
import { Feed } from "./components/Feed.js";
import { Leaderboard } from "./components/Leaderboard.js";
import { Revenue } from "./components/Revenue.js";
import { Drawer } from "./components/Drawer.js";

export function App() {
  const state = useCorpusState();
  const [selected, setSelected] = useState<Submission | null>(null);

  const accepted = state.submissions.filter((s) => s.status === 1).length;
  const rejected = state.submissions.filter((s) => s.status === 2).length;
  const shares = Number(state.totalSupply) / 1e18;

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="brand">
            Corpus<span>.</span>
          </div>
          <div className="tagline">Data royalties for the agent economy</div>
        </div>
        <div className="spacer" />
        <div className="pill">{deployment.network} · chain {deployment.chainId}</div>
        <div className={`pill ${state.chainOnline ? "live" : "stale"}`}>
          {state.chainOnline ? `block ${state.blockNumber}` : "chain offline"}
        </div>
        <div className={`pill ${state.scorerOnline ? "live" : "stale"}`}>
          {state.scorerOnline ? "scorer online" : "scorer offline"}
        </div>
      </header>

      {!state.scorerOnline && state.chainOnline && (
        <div className="banner">
          The scorer is unreachable, so verdict explanations are unavailable. Everything below still
          reflects the chain.
        </div>
      )}

      <div className="stats">
        <div className="stat accent">
          <div className="value">{accepted}</div>
          <div className="label">records accepted</div>
        </div>
        <div className="stat">
          <div className="value">{rejected + state.blocked.length}</div>
          <div className="label">attacks rejected</div>
        </div>
        <div className="stat">
          <div className="value">{shares.toFixed(2)}</div>
          <div className="label">royalty shares</div>
        </div>
        <div className="stat good">
          <div className="value">{mon(state.treasury, 2)}</div>
          <div className="label">MON held for payout</div>
        </div>
      </div>

      <div className="grid">
        <div>
          <Feed state={state} onSelect={setSelected} />
        </div>
        <div>
          <Revenue state={state} />
          <Leaderboard state={state} />
        </div>
      </div>

      {selected && (
        <>
          <div className="backdrop" onClick={() => setSelected(null)} />
          <Drawer
            submission={selected}
            detail={state.details[selected.id]}
            onClose={() => setSelected(null)}
          />
        </>
      )}
    </div>
  );
}

export { shortAddress, ROLE_NAMES };
