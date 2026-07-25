/** Assigns a taxonomy cluster by keyword hit count; drives the dashboard's grouping. */
export function tagFor(canonicalizedText: string, taxonomy: Record<string, string[]>): string {
  let best = "untagged";
  let bestHits = 0;
  for (const [tag, keywords] of Object.entries(taxonomy)) {
    let hits = 0;
    for (const keyword of keywords) if (canonicalizedText.includes(keyword)) hits++;
    if (hits > bestHits) { bestHits = hits; best = tag; }
  }
  return best;
}
