/**
 * Topical relevance is a *lexical* test against vocabulary the curator declares,
 * deliberately not a character-level or centroid-distance one.
 *
 * Character trigrams are excellent at catching near-duplicates and typo-level edits,
 * but every piece of English prose shares roughly the same trigram profile — measured
 * that way, a shipping-logistics record looks exactly as on-topic as a model-failure
 * record (0.44 vs 0.43 on this corpus). Centroid distance fails for a second reason:
 * genuinely novel records introduce new vocabulary, so the most valuable contributions
 * look the least "relevant". Matching the curator's declared domain lexicon separates
 * them cleanly, and it is how a curated dataset actually works — the curator defines
 * the scope, and a submission fitting none of the declared clusters is out of scope.
 *
 * Known limitation: an attacker can prepend on-topic boilerplate to filler to clear
 * this gate. Doing so pulls the record toward the corpus and into the near-duplicate
 * machinery, but a determined semantic attack needs model embeddings to catch.
 */
const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","than","that","this","these","those","of","to","in","on","at","by","for",
  "with","from","as","is","are","was","were","be","been","being","it","its","not","no","when","which","who","whom",
  "there","their","them","they","he","she","his","her","you","your","we","our","us","have","has","had","will","would",
  "could","should","did","does","do","done","can","may","might","must","about","into","over","under","after","before",
  "while","during","because","so","such","only","also","all","any","some","more","most","other","each","every","both",
  "one","two","three","first","second","third","new","old","own","same","very","just","even","still","again","once",
]);

export function contentWords(canonicalizedText: string): Set<string> {
  const words = new Set<string>();
  for (const word of canonicalizedText.split(" ")) {
    if (word.length >= 4 && !STOPWORDS.has(word)) words.add(word);
  }
  return words;
}

export type RelevanceResult = { hits: number; matchedTerms: string[]; inScope: boolean };

/**
 * Counts how many of the corpus's declared domain terms a record actually uses.
 * Terms are matched as prefixes so "refus" covers refuse/refused/refusal.
 */
export function domainRelevance(
  canonicalizedText: string,
  domainLexicon: readonly string[],
  minimumHits: number,
): RelevanceResult {
  const matchedTerms: string[] = [];
  for (const term of domainLexicon) {
    if (canonicalizedText.includes(term)) matchedTerms.push(term);
  }
  return { hits: matchedTerms.length, matchedTerms, inScope: matchedTerms.length >= minimumHits };
}
