/**
 * Cheap English-likeness check. Without it, the highest-scoring strategy is random
 * noise: gibberish is maximally distant from everything already in the corpus, so a
 * pure novelty score would pay it more than real data.
 */
const COMMON_WORDS = new Set([
  "the","a","an","and","or","but","if","then","than","that","this","these","those","of","to","in","on","at","by","for",
  "with","from","as","is","are","was","were","be","been","being","it","its","not","no","when","which","who","asked",
  "expected","observed","instead","should","would","could","did","does","do","model","response","answer","request",
  "user","output","after","before","while","during","because","about","into","only","also","two","three","one","all",
  "returned","produced","wrote","gave","said","never","again","first","second","each","every","any","some","more",
]);

const VOWELS = /[aeiou]/;

export function coherenceScore(canonicalizedText: string): number {
  const words = canonicalizedText.split(" ").filter(Boolean);
  if (words.length < 8) return 0;
  let common = 0;
  let vowelly = 0;
  for (const word of words) {
    if (COMMON_WORDS.has(word)) common++;
    if (VOWELS.test(word)) vowelly++;
  }
  // Real prose carries both function words and vowels in nearly every token.
  const functionWordRatio = common / words.length;
  const vowelRatio = vowelly / words.length;
  return Math.min(1, functionWordRatio * 2.5) * 0.4 + vowelRatio * 0.6;
}
