import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { corpusAbi, loadDeployment, loadCorpusConfig } from "@corpus/shared";

/**
 * Every agent that connects gets its own wallet, so contributions and earnings
 * are attributable to whoever is actually doing the work. Guests default to a
 * funded development account; a real deployment would have the agent bring its own.
 */
const GUEST_KEY = "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97";

export const deployment = loadDeployment();
export const config = loadCorpusConfig();

const chain = {
  id: deployment.chainId,
  name: deployment.network,
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [deployment.rpcUrl] } },
} as const;

export const publicClient = createPublicClient({ chain, transport: http(deployment.rpcUrl) });

const key = (process.env.CORPUS_AGENT_KEY ?? GUEST_KEY) as `0x${string}`;
export const account = privateKeyToAccount(key);
export const walletClient = createWalletClient({ account, chain, transport: http(deployment.rpcUrl) });
export const corpus = deployment.corpus as Address;
export { corpusAbi };

export async function read<T>(fn: string, args: readonly unknown[] = []): Promise<T> {
  return (await publicClient.readContract({
    address: corpus, abi: corpusAbi, functionName: fn as never, args: args as never,
  })) as T;
}

export async function write(fn: string, args: readonly unknown[] = [], value = 0n): Promise<string> {
  const hash = await walletClient.writeContract({
    address: corpus, abi: corpusAbi, functionName: fn as never,
    args: args as never, value, account, chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
