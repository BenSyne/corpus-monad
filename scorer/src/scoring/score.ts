import { embedText } from "@corpus/shared";
import type { CorpusConfig, DataRecord, ScoreDetail } from "@corpus/shared";
import { cosine, containment, embed } from "./embedding.js";
import { coherenceScore } from "./coherence.js";
import { domainRelevance } from "./relevance.js";
import { validateSchema } from "./schema.js";
import { tagFor } from "./tags.js";

export type Accepted = { id: number; text: string; vector: Float64Array };

export type ScoreInput = {
  record: DataRecord | null;
  hashMatches: boolean;
  accepted: Accepted[];
  config: CorpusConfig;
};

export type ScoreResult = { score: number } & Omit<ScoreDetail, "id">;

/**
 * Gates run cheapest-first and the accept band is deliberately narrow: a record
 * must be novel AND on-topic AND coherent AND not a padded copy. Rewarding novelty
 * alone makes off-topic noise the most profitable thing an agent can submit.
 */
export function scoreSubmission({ record, hashMatches, accepted, config }: ScoreInput): ScoreResult {
  const t = config.thresholds;
  const base = { maxSimilarity: 0, relevance: 0, neighbors: 0, tag: "untagged" };

  if (!hashMatches || !record) {
    return { score: 0, gate: "hash-mismatch", reason: "stored bytes do not match the on-chain hash", ...base };
  }

  const schemaError = validateSchema(record, config.schemaFields);
  if (schemaError) return { score: 0, gate: "bad-schema", reason: schemaError, ...base };

  const text = embedText(record, config.embedFields);
  if (text.length < t.minCanonicalLength) {
    return { score: 0, gate: "bad-schema", reason: `content too short (${text.length} chars)`, ...base };
  }

  const coherence = coherenceScore(text);
  if (coherence < t.coherenceFloor) {
    return { score: 0, gate: "low-coherence", reason: `not readable prose (coherence ${coherence.toFixed(2)})`, ...base };
  }

  const vector = embed(text);
  const tag = tagFor(text, config.taxonomy);
  const scope = domainRelevance(text, config.domainLexicon, t.minDomainHits);
  const relevance = scope.hits;
  if (!scope.inScope) {
    return {
      score: 0, gate: "off-topic",
      reason: `outside this corpus's declared scope (matched ${scope.hits} of the curator's domain terms, needs ${t.minDomainHits})`,
      maxSimilarity: 0, relevance, neighbors: 0, tag,
    };
  }

  let maxSimilarity = 0;
  let nearestId = -1;
  let neighbors = 0;
  let maxContainment = 0;
  let containedId = -1;
  for (const prior of accepted) {
    const sim = cosine(vector, prior.vector);
    if (sim > maxSimilarity) { maxSimilarity = sim; nearestId = prior.id; }
    if (sim > t.densityNeighborCosine) neighbors++;
    const cont = containment(text, prior.text);
    if (cont > maxContainment) { maxContainment = cont; containedId = prior.id; }
  }

  const detail = { maxSimilarity, relevance, neighbors, tag };

  // Similarity first: is this substantially the same information we already have?
  if (maxSimilarity >= t.nearDupCosine) {
    return {
      score: 0, gate: "near-dup",
      reason: `near-duplicate of submission #${nearestId} (similarity ${maxSimilarity.toFixed(2)})`,
      ...detail,
    };
  }

  // Then the backstop for copies hidden inside padding. Similarity is computed on
  // normalized vectors, so appending enough unrelated text to a verbatim copy drags
  // it under the threshold above. Containment is a fraction of the *original*, so
  // padding cannot dilute it.
  if (maxContainment >= t.containment) {
    return {
      score: 0, gate: "padded-copy",
      reason: `${(maxContainment * 100).toFixed(0)}% of submission #${containedId}, padded out to evade the similarity check`,
      ...detail,
    };
  }

  const density = 1 / (1 + t.densityDecay * neighbors);
  const lengthFactor = Math.min(1, text.length / t.minCanonicalLength);
  // Relevance scales the payout rather than only gating it: a record that barely
  // clears the scope floor mints dust, so "technically on-topic" filler is never
  // worth more than work that is squarely within the corpus.
  const relevanceFactor = Math.max(0.1, Math.min(1, scope.hits / (t.minDomainHits * 3)));
  const raw = 1000 * (1 - maxSimilarity) * density * lengthFactor * relevanceFactor;
  const score = Math.max(1, Math.min(1000, Math.round(raw)));

  return {
    score, gate: "accepted",
    reason: nearestId < 0
      ? `first record in this corpus (novelty ${score})`
      : `novel vs #${nearestId} (similarity ${maxSimilarity.toFixed(2)}, ${neighbors} close neighbours)`,
    ...detail,
  };
}
