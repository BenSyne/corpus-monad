import { parseAbiItem } from "viem";
import { getRecord, loadCorpusConfig, embedText } from "@corpus/shared";
import type { CorpusConfig } from "@corpus/shared";
import type { Clients } from "./chain.js";
import { embed } from "./scoring/embedding.js";
import { scoreSubmission, type Accepted } from "./scoring/score.js";
import { TxQueue } from "./txQueue.js";
import { saveState, type ScorerState } from "./state.js";

const SUBMISSION_EVENT = parseAbiItem(
  "event SubmissionReceived(uint256 indexed id, address indexed contributor, bytes32 contentHash, string uri)",
);

const POLL_MS = 700;
/** A blob can lag its transaction by a moment; retry before calling it missing. */
const MISSING_BLOB_RETRIES = 3;

export class Watcher {
  private accepted: Accepted[] = [];
  private missCounts = new Map<number, number>();
  private queue = new TxQueue();
  private config: CorpusConfig;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private clients: Clients,
    private state: ScorerState,
  ) {
    this.config = loadCorpusConfig();
  }

  /**
   * Rebuilds the accepted set from the chain before processing anything new, so a
   * scorer that restarts mid-run still compares against everything already in the
   * corpus instead of treating the dataset as empty.
   */
  async bootstrap(): Promise<void> {
    const { publicClient, corpus, corpusAbi } = this.clients;
    const count = Number(await publicClient.readContract({ address: corpus, abi: corpusAbi, functionName: "submissionCount" }));
    for (let id = 0; id < count; id++) {
      const s = (await publicClient.readContract({
        address: corpus, abi: corpusAbi, functionName: "getSubmission", args: [BigInt(id)],
      })) as { contentHash: string; status: number };
      if (s.status !== 1) continue; // only Scored records shape future scoring
      const { record } = getRecord(s.contentHash, this.config.contentKeyHex);
      if (!record) continue;
      const text = embedText(record, this.config.embedFields);
      this.accepted.push({ id, text, vector: embed(text) });
    }
    if (this.accepted.length > 0) {
      console.log(`[scorer] rebuilt ${this.accepted.length} accepted records from chain`);
    }
  }

  start(): void {
    const tick = () => {
      this.poll()
        .catch((err) => console.error("[scorer] poll failed:", err instanceof Error ? err.message : err))
        .finally(() => {
          this.timer = setTimeout(tick, POLL_MS);
        });
    };
    tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private async poll(): Promise<void> {
    const { publicClient, corpus } = this.clients;
    const head = Number(await publicClient.getBlockNumber());
    if (head < this.state.lastProcessedBlock) return;

    const logs = await publicClient.getLogs({
      address: corpus,
      event: SUBMISSION_EVENT,
      fromBlock: BigInt(this.state.lastProcessedBlock),
      toBlock: BigInt(head),
    });

    for (const log of logs) {
      const id = Number(log.args.id);
      await this.process(id, log.args.contentHash as string);
    }

    this.state.lastProcessedBlock = head + 1;
    saveState(this.state);
  }

  private async process(id: number, contentHash: string): Promise<void> {
    const { publicClient, walletClient, corpus, corpusAbi, account } = this.clients;
    // The submission may already have been scored by a previous run of this
    // process; postScore would revert, so check the chain rather than assume.
    const submission = (await publicClient.readContract({
      address: corpus, abi: corpusAbi, functionName: "getSubmission", args: [BigInt(id)],
    })) as { status: number };
    if (submission.status !== 0) return;

    const { record, hashMatches } = getRecord(contentHash, this.config.contentKeyHex);
    if (!record && !hashMatches) {
      const misses = (this.missCounts.get(id) ?? 0) + 1;
      this.missCounts.set(id, misses);
      if (misses <= MISSING_BLOB_RETRIES) return; // give the writer a moment to land
    }

    const result = scoreSubmission({ record, hashMatches, accepted: this.accepted, config: this.config });

    // Publish the reasoning before the transaction lands. Otherwise the chain shows
    // a verdict that the API cannot yet explain, and anything watching both — the
    // dashboard included — sees a scored submission with no reason attached.
    this.state.details[id] = { id, ...result };
    saveState(this.state);

    await this.queue.run(async () => {
      const hash = await walletClient.writeContract({
        address: corpus, abi: corpusAbi, functionName: "postScore",
        args: [BigInt(id), result.score, result.reason], account, chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    });

    if (result.score > 0 && record) {
      const text = embedText(record, this.config.embedFields);
      this.accepted.push({ id, text, vector: embed(text) });
    }
    saveState(this.state);

    const verdict = result.score > 0 ? `ACCEPTED ${result.score}` : `REJECTED (${result.gate})`;
    console.log(`[scorer] #${id} ${verdict} — ${result.reason}`);
  }
}
