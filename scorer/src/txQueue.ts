/**
 * Serializes score transactions. Firing them concurrently would reuse the same
 * nonce and drop all but one, which looks exactly like the scorer ignoring
 * submissions.
 */
export class TxQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
