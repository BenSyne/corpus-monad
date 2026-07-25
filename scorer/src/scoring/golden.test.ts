import { describe, it, expect } from "vitest";
import { loadCorpusConfig, loadSeedRecords, embedText } from "@corpus/shared";
import { embed, cosine, containment } from "./embedding.js";
import { scoreSubmission, type Accepted } from "./score.js";

/**
 * The demo's whole point is that four attacks visibly fail while honest work is paid.
 * These assertions run the real pipeline over the real seed files, so editing a seed
 * record can never quietly flip the outcome on stage.
 */
const config = loadCorpusConfig();
const honest = loadSeedRecords("honest");
const attacks = loadSeedRecords("attack");

function textOf(record: Record<string, string>): string {
  return embedText(record, config.embedFields);
}

/** Replays the honest records through the scorer the way the live run will. */
function acceptHonest(): { accepted: Accepted[]; scores: number[] } {
  const accepted: Accepted[] = [];
  const scores: number[] = [];
  honest.forEach(({ record }, index) => {
    const result = scoreSubmission({ record, hashMatches: true, accepted, config });
    scores.push(result.score);
    if (result.score > 0) {
      const text = textOf(record);
      accepted.push({ id: index, text, vector: embed(text) });
    }
  });
  return { accepted, scores };
}

describe("golden seed corpus", () => {
  it("accepts all ten honest records", () => {
    const { scores } = acceptHonest();
    scores.forEach((score, i) => {
      expect(score, `honest/${honest[i]!.name} was rejected`).toBeGreaterThan(0);
    });
  });

  it("keeps honest records comfortably clear of the near-duplicate threshold", () => {
    const vectors = honest.map(({ record }) => embed(textOf(record)));
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        const sim = cosine(vectors[i]!, vectors[j]!);
        expect(sim, `honest ${honest[i]!.name} vs ${honest[j]!.name} = ${sim.toFixed(3)}`).toBeLessThan(0.8);
      }
    }
  });

  it("keeps honest records clear of the containment threshold", () => {
    const texts = honest.map(({ record }) => textOf(record));
    for (let i = 0; i < texts.length; i++) {
      for (let j = 0; j < texts.length; j++) {
        if (i === j) continue;
        expect(containment(texts[i]!, texts[j]!)).toBeLessThan(config.thresholds.containment);
      }
    }
  });

  it("scores honest records inside the range the demo narrates", () => {
    const { scores } = acceptHonest();
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(average).toBeGreaterThan(300);
    expect(Math.min(...scores)).toBeGreaterThan(100);
  });

  it("catches the padded copy by containment, after it evades similarity", () => {
    const { accepted } = acceptHonest();
    const padded = attacks.find((a) => a.name.includes("padded"))!;
    const result = scoreSubmission({ record: padded.record, hashMatches: true, accepted, config });
    // The padding genuinely works against cosine — that is precisely why the
    // containment check exists, and why this must stay under the threshold.
    expect(result.maxSimilarity).toBeLessThan(config.thresholds.nearDupCosine);
    expect(result.gate).toBe("padded-copy");
    expect(result.score).toBe(0);
  });

  it("catches the paraphrase by similarity", () => {
    const { accepted } = acceptHonest();
    const paraphrase = attacks.find((a) => a.name.includes("paraphrase"))!;
    const result = scoreSubmission({ record: paraphrase.record, hashMatches: true, accepted, config });
    expect(result.maxSimilarity).toBeGreaterThanOrEqual(config.thresholds.nearDupCosine);
    expect(result.score).toBe(0);
    expect(result.gate).toBe("near-dup");
  });

  it("rejects off-topic filler that would otherwise score as maximally novel", () => {
    const { accepted } = acceptHonest();
    const slop = attacks.find((a) => a.name.includes("slop"))!;
    const result = scoreSubmission({ record: slop.record, hashMatches: true, accepted, config });
    expect(result.score).toBe(0);
    expect(result.gate).toBe("off-topic");
  });

  it("rejects gibberish before it can claim a novelty bonus", () => {
    const { accepted } = acceptHonest();
    const gibberish = attacks.find((a) => a.name.includes("gibberish"))!;
    const result = scoreSubmission({ record: gibberish.record, hashMatches: true, accepted, config });
    expect(result.score).toBe(0);
    expect(["low-coherence", "off-topic"]).toContain(result.gate);
  });

  it("rejects a record whose stored bytes fail the on-chain hash check", () => {
    const result = scoreSubmission({ record: null, hashMatches: false, accepted: [], config });
    expect(result.gate).toBe("hash-mismatch");
    expect(result.score).toBe(0);
  });
});

describe("gate margins on the shipped seed data", () => {
  it("every honest record clears every gate with margin", () => {
    const accepted: Accepted[] = [];
    honest.forEach(({ name, record }, index) => {
      const result = scoreSubmission({ record, hashMatches: true, accepted, config });
      expect(result.gate, `${name}: ${result.reason}`).toBe("accepted");
      expect(result.relevance, `${name} domain terms`).toBeGreaterThanOrEqual(config.thresholds.minDomainHits);
      expect(result.maxSimilarity, `${name} similarity headroom`).toBeLessThan(config.thresholds.nearDupCosine - 0.05);
      const text = textOf(record);
      accepted.push({ id: index, text, vector: embed(text) });
    });
  });
});
