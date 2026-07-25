import { mon, type CorpusState } from "../useCorpusState.js";

export function Revenue({ state }: { state: CorpusState }) {
  const slashed = state.submissions
    .filter((s) => s.status === 2)
    .reduce((sum, s) => sum + s.bond, 0n);

  return (
    <div className="panel">
      <h2>Where the money goes</h2>
      <p className="sub">Every access purchase splits three ways, on-chain, the moment it lands.</p>

      <div className="split">
        <div className="holders" style={{ flex: 70 }}>
          70% contributors
        </div>
        <div className="curator" style={{ flex: 20 }}>
          20% curator
        </div>
        <div className="protocol" style={{ flex: 10 }}>
          10%
        </div>
      </div>

      <table>
        <tbody>
          <tr>
            <td className="role">Records sold access to</td>
            <td>{state.scoredCount}</td>
          </tr>
          <tr>
            <td className="role">Bonds forfeited by attackers</td>
            <td className={slashed > 0n ? "pos" : ""}>{mon(slashed)} MON</td>
          </tr>
          <tr>
            <td className="role">Held for outstanding claims</td>
            <td>{mon(state.treasury)} MON</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
