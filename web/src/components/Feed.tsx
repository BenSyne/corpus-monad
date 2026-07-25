import { ROLE_NAMES, shortAddress, type CorpusState, type Submission } from "../useCorpusState.js";

const STATUS = ["pending", "accepted", "rejected", "expired"] as const;
const CHIP_LABEL: Record<string, string> = {
  pending: "scoring…",
  accepted: "novel",
  rejected: "slashed",
  expired: "expired",
};

export function Feed({ state, onSelect }: { state: CorpusState; onSelect: (s: Submission) => void }) {
  const rows = [...state.submissions].reverse();

  return (
    <div className="panel">
      <h2>Live submissions</h2>
      <p className="sub">Every record an agent has bonded, and what the scorer decided about it.</p>

      {rows.length === 0 && state.blocked.length === 0 && (
        <div className="empty">
          No submissions yet.
          <br />
          Run <code>pnpm demo</code> to start the agents.
        </div>
      )}

      <div className="feed">
        {state.blocked.map((b) => (
          <div key={b.contentHash} className="card blocked">
            <div className="card-top">
              <span className="chip blocked">blocked</span>
              <span className="who">{ROLE_NAMES[b.actor] ?? shortAddress(b.actor)}</span>
            </div>
            <div className="reason">
              Rejected by the contract before it cost anything — this exact record already exists.
            </div>
          </div>
        ))}

        {rows.map((s) => {
          const status = STATUS[s.status] ?? "pending";
          const detail = state.details[s.id];
          return (
            <div key={s.id} className={`card ${status}`} onClick={() => onSelect(s)}>
              <div className="card-top">
                <span className={`chip ${status}`}>
                  {status === "accepted" ? `${CHIP_LABEL.accepted} +${s.score}` : CHIP_LABEL[status]}
                </span>
                <span className="id">#{s.id}</span>
                <span className="who">{ROLE_NAMES[s.contributor] ?? shortAddress(s.contributor)}</span>
                {detail?.tag && detail.tag !== "untagged" && <span className="tag">{detail.tag}</span>}
              </div>
              <div className="reason">
                {detail?.reason ??
                  (s.status === 0 ? "waiting for the scorer…" : "reason unavailable — the scorer is offline")}
              </div>
              {detail && detail.maxSimilarity > 0 && (
                <div className="simbar">
                  <div style={{ width: `${Math.min(100, detail.maxSimilarity * 100)}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
