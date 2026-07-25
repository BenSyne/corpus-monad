import { useEffect, useState } from "react";
import { createPublicClient, http, formatEther, type Address } from "viem";
import deployment from "@deployment";
import { corpusAbi } from "@abi";

const POLL_MS = 700;

/**
 * A hosted build has to talk to endpoints the visitor's browser can actually
 * reach. The deployment file is written for whoever deployed the contracts, so
 * these overrides let one build serve a public chain and a public scorer without
 * touching the committed addresses.
 */
const RPC_URL = import.meta.env.VITE_RPC_URL || deployment.rpcUrl;
const SCORER_API = import.meta.env.VITE_SCORER_API || "http://127.0.0.1:8787";
const CORPUS_ADDRESS = (import.meta.env.VITE_CORPUS_ADDRESS || deployment.corpus) as Address;
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || deployment.chainId);
export const EXPLORER = import.meta.env.VITE_EXPLORER || deployment.explorer || "";
export const CHAIN = { id: CHAIN_ID, corpus: CORPUS_ADDRESS };
/** Derived from the chain actually being read, so the header can't claim the wrong network. */
export const NETWORK_LABEL =
  CHAIN_ID === 10143 ? "monad testnet" : CHAIN_ID === 143 ? "monad mainnet" : deployment.network;

const chain = {
  id: CHAIN_ID,
  name: deployment.network,
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const client = createPublicClient({ chain, transport: http(RPC_URL) });
const corpus = CORPUS_ADDRESS;

export type Submission = {
  id: number;
  contributor: Address;
  contentHash: string;
  uri: string;
  bond: bigint;
  submittedAt: number;
  score: number;
  status: number;
};

export type Detail = {
  id: number;
  reason: string;
  gate: string;
  maxSimilarity: number;
  relevance: number;
  neighbors: number;
  tag: string;
};

export type Blocked = { contentHash: string; actor: string; error: string; at: number };

export type Holder = {
  address: Address; shares: bigint; claimable: bigint; credits: bigint;
  /** Royalties already paid out — without this, a contributor who claims looks unpaid. */
  withdrawn: bigint; spent: bigint;
};

export type CorpusState = {
  blockNumber: number;
  submissions: Submission[];
  details: Record<number, Detail>;
  blocked: Blocked[];
  holders: Holder[];
  treasury: bigint;
  totalSupply: bigint;
  scoredCount: number;
  purchases: number;
  scorerOnline: boolean;
  chainOnline: boolean;
};

const EMPTY: CorpusState = {
  blockNumber: 0, submissions: [], details: {}, blocked: [], holders: [], treasury: 0n,
  totalSupply: 0n, scoredCount: 0, purchases: 0, scorerOnline: false, chainOnline: false,
};

/**
 * Chain data is the source of truth for what happened; the scorer only explains
 * why. If the scorer is unreachable the dashboard keeps working with reasons
 * missing, rather than going blank.
 */
export function useCorpusState(): CorpusState {
  const [state, setState] = useState<CorpusState>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      let chainOnline = false;
      let next: Partial<CorpusState> = {};

      try {
        const [blockNumber, submissions, totalSupply, scoredCount, treasury] = await Promise.all([
          client.getBlockNumber(),
          client.readContract({ address: corpus, abi: corpusAbi, functionName: "getSubmissions", args: [0n, 200n] }),
          client.readContract({ address: corpus, abi: corpusAbi, functionName: "totalSupply" }),
          client.readContract({ address: corpus, abi: corpusAbi, functionName: "scoredCount" }),
          client.getBalance({ address: corpus }),
        ]);

        const list = (submissions as Submission[]).map((s, id) => ({ ...s, id, submittedAt: Number(s.submittedAt), score: Number(s.score) }));
        const actors = [...new Set(list.map((s) => s.contributor))];
        const holders = await Promise.all(
          actors.map(async (address) => {
            const [shares, claimable, credits, withdrawn] = await Promise.all([
              client.readContract({ address: corpus, abi: corpusAbi, functionName: "balanceOf", args: [address] }),
              client.readContract({ address: corpus, abi: corpusAbi, functionName: "withdrawableDividendOf", args: [address] }),
              client.readContract({ address: corpus, abi: corpusAbi, functionName: "creditsOf", args: [address] }),
              client.readContract({ address: corpus, abi: corpusAbi, functionName: "withdrawnDividends", args: [address] }),
            ]);
            const spent = list
              .filter((s) => s.contributor === address)
              .reduce((sum, s) => sum + (s.status === 2 ? s.bond : 0n), 0n);
            return {
              address, shares: shares as bigint, claimable: claimable as bigint,
              credits: credits as bigint, withdrawn: withdrawn as bigint, spent,
            };
          }),
        );

        chainOnline = true;
        next = {
          blockNumber: Number(blockNumber),
          submissions: list,
          totalSupply: totalSupply as bigint,
          scoredCount: Number(scoredCount),
          treasury,
          holders,
          chainOnline,
        };
      } catch {
        next = { chainOnline: false };
      }

      try {
        const res = await fetch(`${SCORER_API}/state`);
        const data = (await res.json()) as { details: Detail[]; blocked: Blocked[] };
        const details: Record<number, Detail> = {};
        for (const d of data.details) details[Number(d.id)] = d;
        next = { ...next, details, blocked: data.blocked ?? [], scorerOnline: true };
      } catch {
        next = { ...next, scorerOnline: false };
      }

      if (!cancelled) setState((prev) => ({ ...prev, ...next }));
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}

export function mon(value: bigint, dp = 3): string {
  return Number(formatEther(value)).toFixed(dp);
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const ROLE_NAMES: Record<string, string> = {
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC": "honest agent A",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906": "honest agent B",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65": "copycat",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc": "slopbot",
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9": "buyer",
  // Any agent that connects over MCP and hasn't been given its own key.
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f": "outside agent (MCP)",
};
