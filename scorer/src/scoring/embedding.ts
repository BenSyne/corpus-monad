/**
 * Deterministic, offline text embedding: character trigrams hashed into a fixed
 * vector. No model, no API, no network — which is what makes scoring reproducible
 * in tests and safe to run with the venue wifi off.
 */
export const DIMS = 512;

export function trigrams(text: string): string[] {
  if (text.length < 3) return text.length ? [text] : [];
  const grams: string[] = [];
  for (let i = 0; i + 3 <= text.length; i++) grams.push(text.slice(i, i + 3));
  return grams;
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function embed(text: string): Float64Array {
  const vec = new Float64Array(DIMS);
  for (const gram of trigrams(text)) vec[fnv1a(gram) % DIMS]! += 1;
  let norm = 0;
  for (let i = 0; i < DIMS; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIMS; i++) vec[i]! /= norm;
  return vec;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < DIMS; i++) dot += a[i]! * b[i]!;
  return dot;
}

/**
 * Asymmetric containment: what fraction of the earlier record's trigrams appear
 * in the new one. Cosine on normalized vectors is length-sensitive — appending
 * roughly a quarter more text to a verbatim copy drops similarity below any
 * sane threshold — so padded plagiarism needs a length-invariant check.
 */
export function containment(newText: string, priorText: string): number {
  const prior = new Set(trigrams(priorText));
  if (prior.size === 0) return 0;
  const next = new Set(trigrams(newText));
  let shared = 0;
  for (const gram of prior) if (next.has(gram)) shared++;
  return shared / prior.size;
}
