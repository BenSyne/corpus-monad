import { createPublicClient, createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { corpusAbi, loadDeployment, privateKeyFor, putRecord, loadCorpusConfig } from "@corpus/shared";
import type { DataRecord, Role } from "@corpus/shared";

const deployment = loadDeployment();
const config = loadCorpusConfig();

const chain = {
  id: deployment.chainId,
  name: deployment.network,
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [deployment.rpcUrl] } },
} as const;

export const publicClient = createPublicClient({ chain, transport: http(deployment.rpcUrl) });
export const corpusAddress = deployment.corpus as Address;
export { corpusAbi, deployment, config };

export type Agent = ReturnType<typeof makeAgent>;

export function makeAgent(role: Role) {
  const account = privateKeyToAccount(privateKeyFor(role));
  const wallet = createWalletClient({ account, chain, transport: http(deployment.rpcUrl) });

  return {
    role,
    address: account.address,
    account,
    wallet,

    /**
     * Writes the record to the content store first, then bonds it on-chain. The
     * order matters: the scorer reads the stored bytes as soon as it sees the
     * event, and a record that isn't there yet looks like a bad submission.
     */
    async submit(record: DataRecord): Promise<{ hash: Hash; contentHash: string }> {
      const stored = putRecord(record, config.contentKeyHex);
      const bond = await publicClient.readContract({ address: corpusAddress, abi: corpusAbi, functionName: "bondAmount" });
      const hash = await wallet.writeContract({
        address: corpusAddress, abi: corpusAbi, functionName: "submit",
        args: [stored.hash, stored.uri], value: bond as bigint, account, chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return { hash, contentHash: stored.hash };
    },

    async buyAccess(): Promise<Hash> {
      const price = await publicClient.readContract({ address: corpusAddress, abi: corpusAbi, functionName: "accessPrice" });
      const hash = await wallet.writeContract({
        address: corpusAddress, abi: corpusAbi, functionName: "buyAccess",
        args: [], value: price as bigint, account, chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async claimAll(): Promise<void> {
      for (const fn of ["claimDividends", "withdrawCredits"] as const) {
        try {
          const hash = await wallet.writeContract({
            address: corpusAddress, abi: corpusAbi, functionName: fn, args: [], account, chain: null,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        } catch {
          // Nothing owed on this track — the other one may still pay out.
        }
      }
    },

    balance(): Promise<bigint> {
      return publicClient.getBalance({ address: account.address });
    },
  };
}

export async function submissionStatus(id: number): Promise<{ status: number; score: number }> {
  const s = (await publicClient.readContract({
    address: corpusAddress, abi: corpusAbi, functionName: "getSubmission", args: [BigInt(id)],
  })) as { status: number; score: number };
  return { status: s.status, score: Number(s.score) };
}

/** Waits for the scorer's verdict rather than sleeping a guessed interval. */
export async function waitForVerdict(id: number, timeoutMs = 30_000): Promise<{ status: number; score: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await submissionStatus(id);
    if (s.status !== 0) return s;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`submission #${id} was never scored — is the scorer running?`);
}

export async function reportBlocked(contentHash: string, actor: string, error: string): Promise<void> {
  try {
    await fetch("http://127.0.0.1:8787/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentHash, actor, error, at: Date.now() }),
    });
  } catch {
    // The dashboard is a nice-to-have; never let it break the run.
  }
}
