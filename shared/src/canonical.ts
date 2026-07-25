/**
 * Canonical JSON: stable key order, no incidental whitespace.
 * The bytes produced here are the bytes we encrypt, hash, and commit on-chain,
 * so every producer and consumer must serialize through this one function.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Lowercase, strip punctuation, collapse whitespace — the text the scorer embeds. */
export function canonicalText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Concatenate the semantic fields a corpus declares as meaning-bearing. */
export function embedText(record: Record<string, unknown>, embedFields: readonly string[]): string {
  return canonicalText(embedFields.map((f) => String(record[f] ?? "")).join(" "));
}
