import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BlockedEvent, ScoreDetail } from "@corpus/shared";
import { jsonStringify } from "@corpus/shared";

const STATE_PATH = join(process.cwd(), "scorer", "state.json");

export type ScorerState = {
  corpus: string;
  lastProcessedBlock: number;
  details: Record<number, ScoreDetail>;
  blocked: BlockedEvent[];
};

function empty(corpus: string, deployBlock: number): ScorerState {
  return { corpus, lastProcessedBlock: deployBlock, details: {}, blocked: [] };
}

/**
 * Loads persisted state, discarding it whenever it cannot belong to the chain we
 * are now talking to. Restarting against a fresh chain is the normal case between
 * demo runs, and a cursor left pointing past the chain head would silently stop
 * the scorer from ever seeing a submission again.
 */
export function loadState(corpus: string, deployBlock: number, chainHead: number): ScorerState {
  if (!existsSync(STATE_PATH)) return empty(corpus, deployBlock);
  try {
    const saved = JSON.parse(readFileSync(STATE_PATH, "utf8")) as ScorerState;
    const staleChain = saved.lastProcessedBlock > chainHead;
    const differentCorpus = saved.corpus.toLowerCase() !== corpus.toLowerCase();
    if (staleChain || differentCorpus) {
      console.log(`[scorer] discarding stale state (${staleChain ? "chain was reset" : "different corpus"})`);
      return empty(corpus, deployBlock);
    }
    return saved;
  } catch {
    return empty(corpus, deployBlock);
  }
}

export function saveState(state: ScorerState): void {
  writeFileSync(STATE_PATH, jsonStringify(state));
}
