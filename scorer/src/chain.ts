import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { corpusAbi, loadDeployment, privateKeyFor } from "@corpus/shared";

export function makeClients() {
  const deployment = loadDeployment();
  const chain = {
    id: deployment.chainId,
    name: deployment.network,
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpcUrl] } },
  } as const;

  const publicClient = createPublicClient({ chain, transport: http(deployment.rpcUrl) });
  const account = privateKeyToAccount(privateKeyFor("scorer"));
  const walletClient = createWalletClient({ account, chain, transport: http(deployment.rpcUrl) });

  return { deployment, publicClient, walletClient, account, corpus: deployment.corpus as Address, corpusAbi };
}

export type Clients = ReturnType<typeof makeClients>;
