declare module "@deployment" {
  const deployment: {
    network: string; chainId: number; rpcUrl: string;
    factory: `0x${string}`; corpus: `0x${string}`; deployBlock: number; explorer?: string;
  };
  export default deployment;
}
declare module "@abi" {
  export const corpusAbi: readonly unknown[];
  export const corpusFactoryAbi: readonly unknown[];
}
