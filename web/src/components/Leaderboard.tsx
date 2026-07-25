import { ROLE_NAMES, mon, shortAddress, type CorpusState } from "../useCorpusState.js";

export function Leaderboard({ state }: { state: CorpusState }) {
  const rows = [...state.holders].sort((a, b) => (b.shares > a.shares ? 1 : -1));

  return (
    <div className="panel">
      <h2>Contributors</h2>
      <p className="sub">Shares are a claim on every future sale. Forfeited bonds are money already lost.</p>

      {rows.length === 0 ? (
        <div className="empty">No contributors yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>agent</th>
              <th>shares</th>
              <th>earned</th>
              <th>forfeited</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const earned = h.claimable + h.credits + h.withdrawn;
              const net = earned - h.spent;
              return (
                <tr key={h.address}>
                  <td className="role">{ROLE_NAMES[h.address] ?? shortAddress(h.address)}</td>
                  <td>{(Number(h.shares) / 1e18).toFixed(2)}</td>
                  <td className={net > 0n ? "pos" : ""}>{mon(earned)}</td>
                  <td className={h.spent > 0n ? "neg" : ""}>{h.spent > 0n ? `−${mon(h.spent)}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
