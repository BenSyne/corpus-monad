export type CorpusConfig = {
  name: string;
  symbol: string;
  description: string;
  schemaFields: string[];
  embedFields: string[];
  taxonomy: Record<string, string[]>;
  /** Curator-declared vocabulary that defines this corpus's scope. */
  domainLexicon: string[];
  thresholds: {
    nearDupCosine: number;
    containment: number;
    densityNeighborCosine: number;
    densityDecay: number;
    coherenceFloor: number;
    minCanonicalLength: number;
    minDomainHits: number;
  };
  /** Dev-only demo key. A real deployment issues per-corpus keys the curator controls. */
  contentKeyHex: string;
};

export type DataRecord = Record<string, string>;

export type SubmissionStatus = "Pending" | "Scored" | "Rejected" | "Expired";

export type ChainSubmission = {
  id: number;
  contributor: `0x${string}`;
  contentHash: `0x${string}`;
  uri: string;
  bond: string;
  submittedAt: number;
  score: number;
  status: SubmissionStatus;
};

/** Scorer-side detail the chain doesn't carry: why a score was what it was. */
export type ScoreDetail = {
  id: number;
  reason: string;
  gate: "accepted" | "bad-schema" | "hash-mismatch" | "low-coherence" | "off-topic" | "padded-copy" | "near-dup";
  maxSimilarity: number;
  relevance: number;
  neighbors: number;
  tag: string;
};

/** A submit that reverted on-chain — no event exists, so the demo reports it directly. */
export type BlockedEvent = {
  contentHash: string;
  actor: string;
  error: string;
  at: number;
};

export type Deployment = {
  network: string;
  chainId: number;
  rpcUrl: string;
  factory: `0x${string}`;
  corpus: `0x${string}`;
  deployBlock: number;
  explorer?: string;
};
