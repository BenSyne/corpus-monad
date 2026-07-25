import { createServer } from "node:http";
import { verifyMessage } from "viem";
import { getRecord, jsonStringify, loadCorpusConfig, loadSeedRecords } from "@corpus/shared";
import type { BlockedEvent } from "@corpus/shared";
import type { Clients } from "./chain.js";
import type { ScorerState } from "./state.js";

const PORT = 8787;
/** Signatures are only accepted briefly, so an observed one cannot be replayed later. */
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export function startStateApi(clients: Clients, state: ScorerState) {
  const config = loadCorpusConfig();

  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url ?? "/", "http://localhost");

    try {
      if (url.pathname === "/state") {
        // Metadata only. Paying for access is what unlocks the records themselves.
        res.end(jsonStringify({
          corpus: state.corpus,
          details: Object.values(state.details),
          blocked: state.blocked,
          config: { name: config.name, thresholds: config.thresholds, taxonomy: Object.keys(config.taxonomy) },
        }));
        return;
      }

      if (url.pathname === "/events" && req.method === "POST") {
        // A submission that reverts leaves no event on-chain, so the demo reports
        // blocked attempts here to keep the dashboard's view complete.
        const body = await readBody(req);
        const event = JSON.parse(body) as BlockedEvent;
        state.blocked.push(event);
        res.end(jsonStringify({ ok: true }));
        return;
      }

      if (url.pathname === "/manifest") {
        const signature = url.searchParams.get("signature") as `0x${string}` | null;
        const timestamp = Number(url.searchParams.get("timestamp") ?? 0);
        if (!signature || !timestamp) {
          res.statusCode = 400;
          res.end(jsonStringify({ error: "signature and timestamp required" }));
          return;
        }
        if (Math.abs(Date.now() - timestamp) > SIGNATURE_WINDOW_MS) {
          res.statusCode = 401;
          res.end(jsonStringify({ error: "signature expired" }));
          return;
        }

        const message = accessMessage(clients.corpus, clients.deployment.chainId, timestamp);
        const buyer = url.searchParams.get("address") as `0x${string}` | null;
        const valid = buyer ? await verifyMessage({ address: buyer, message, signature }) : false;
        if (!buyer || !valid) {
          res.statusCode = 401;
          res.end(jsonStringify({ error: "bad signature" }));
          return;
        }

        const hasAccess = await clients.publicClient.readContract({
          address: clients.corpus, abi: clients.corpusAbi, functionName: "hasAccess", args: [buyer],
        });
        if (!hasAccess) {
          res.statusCode = 402;
          res.end(jsonStringify({ error: "no active access — call buyAccess()" }));
          return;
        }

        res.end(jsonStringify({ records: await acceptedRecords(clients, state), contentKey: config.contentKeyHex }));
        return;
      }

      res.statusCode = 404;
      res.end(jsonStringify({ error: "not found" }));
    } catch (err) {
      res.statusCode = 500;
      res.end(jsonStringify({ error: err instanceof Error ? err.message : "unknown" }));
    }
  });

  server.listen(PORT, () => console.log(`[scorer] state API on http://127.0.0.1:${PORT}`));
  return server;
}

/** Binding the message to this corpus, chain, and moment stops it being reused elsewhere. */
export function accessMessage(corpus: string, chainId: number, timestamp: number): string {
  return `Corpus access request\ncorpus: ${corpus}\nchainId: ${chainId}\ntimestamp: ${timestamp}`;
}

async function acceptedRecords(clients: Clients, state: ScorerState) {
  const config = loadCorpusConfig();
  const records = [];
  for (const detail of Object.values(state.details)) {
    if (detail.gate !== "accepted") continue;
    const submission = (await clients.publicClient.readContract({
      address: clients.corpus, abi: clients.corpusAbi, functionName: "getSubmission", args: [BigInt(detail.id)],
    })) as { contentHash: string; contributor: string };
    const { record } = getRecord(submission.contentHash, config.contentKeyHex);
    if (record) records.push({ id: detail.id, contributor: submission.contributor, tag: detail.tag, record });
  }
  return records;
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export { loadSeedRecords };
