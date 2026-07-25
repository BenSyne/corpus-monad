import deployment from "@deployment";
import { ROLE_NAMES, mon, shortAddress, type Detail, type Submission } from "../useCorpusState.js";

const STATUS_TEXT = ["awaiting the scorer", "accepted", "rejected and slashed", "expired, bond reclaimed"];

export function Drawer({
  submission, detail, onClose,
}: { submission: Submission; detail?: Detail; onClose: () => void }) {
  return (
    <div className="drawer">
      <button className="close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <h3>Submission #{submission.id}</h3>

      <Row label="provenance">
        {ROLE_NAMES[submission.contributor] ?? shortAddress(submission.contributor)}
        <br />
        {submission.contributor}
      </Row>
      <Row label="content hash">{submission.contentHash}</Row>
      <Row label="stored at">{submission.uri}</Row>
      <Row label="bonded">{mon(submission.bond)} MON</Row>
      <Row label="submitted">{new Date(submission.submittedAt * 1000).toLocaleString()}</Row>
      <Row label="outcome">
        {STATUS_TEXT[submission.status]}
        {submission.status === 1 && ` — ${submission.score}/1000 → ${(submission.score / 1000).toFixed(3)} shares`}
      </Row>

      {detail && (
        <>
          <Row label="scorer reasoning">{detail.reason}</Row>
          <Row label="closest existing record">{(detail.maxSimilarity * 100).toFixed(1)}% similar</Row>
          <Row label="corpus scope">{detail.relevance} matching domain terms</Row>
          <Row label="cluster">{detail.tag}</Row>
        </>
      )}

      {deployment.explorer && (
        <Row label="explorer">
          <a href={`${deployment.explorer}/address/${deployment.corpus}`} target="_blank" rel="noreferrer">
            view corpus on the explorer
          </a>
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="k">{label}</div>
      <div className="v">{children}</div>
    </div>
  );
}
